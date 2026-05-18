import { Prisma } from "@prisma/client";
import { withSystemRls } from "@/lib/rls";
import { enqueueWhatsApp, enqueueEmail } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { CaseStage } from "@/lib/db-enums";

/**
 * Sistema autónomo de avisos de morosidad sobre Casos.
 *
 * A diferencia del cron de hive-financial-control (que opera sobre Cuota),
 * éste opera directamente sobre Case usando `halted_at` como punto de partida.
 * Razón: no todos los Casos tienen un contrato en financial-control —
 * un caso puede entrar en HALTED_BY_PAYMENT por validación administrativa,
 * cuotas atrasadas externas, o decisión manual del SuperAdmin.
 *
 * Reglas:
 *   - Día 10 desde `halted_at` → WARNING_10  (recordatorio).
 *   - Día 20                   → WARNING_20  (aviso crítico).
 *   - Día 30                   → WARNING_30  (corte: user.active=false,
 *                                            unpaid_months ≥ 3, audit final).
 *
 * Idempotencia: tabla `CaseWarning` con @@unique(caseId, level).
 *
 * El cron diario se dispara desde `POST /api/cron/case-warnings` con
 * `x-cron-secret`. Convive con el cron de financial-control sin colisión:
 *   - financial-control envía warnings a este service via webhook
 *     `/api/internal/integration/financial-warning` cuando el caso SÍ tiene
 *     cuotas asociadas.
 *   - este cron cubre los casos sin cuota en financial (mayoría hoy).
 *
 * El dashboard `/admin/mora` lee `CaseWarning` directamente.
 */

export const CASE_WARNING_THRESHOLDS_DAYS = {
  WARNING_10: 10,
  WARNING_20: 20,
  WARNING_30: 30,
} as const;

export type CaseWarningLevel = keyof typeof CASE_WARNING_THRESHOLDS_DAYS;

export type CaseWarningRunResult = {
  scanned: number;
  evaluated: number;
  dispatched: Record<CaseWarningLevel, number>;
  skipped_already_sent: number;
  errors: Array<{ case_id: string; level: CaseWarningLevel; message: string }>;
  duration_ms: number;
};

function emptyCounts(): Record<CaseWarningLevel, number> {
  return { WARNING_10: 0, WARNING_20: 0, WARNING_30: 0 };
}

export function computeCaseWarningLevel(diasHalted: number): CaseWarningLevel | null {
  if (diasHalted >= CASE_WARNING_THRESHOLDS_DAYS.WARNING_30) return "WARNING_30";
  if (diasHalted >= CASE_WARNING_THRESHOLDS_DAYS.WARNING_20) return "WARNING_20";
  if (diasHalted >= CASE_WARNING_THRESHOLDS_DAYS.WARNING_10) return "WARNING_10";
  return null;
}

/** Recorrido principal. Idempotente, reentrante, fail-safe por caso. */
export async function runDailyCaseWarnings(now: Date = new Date()): Promise<CaseWarningRunResult> {
  const startedAt = Date.now();
  const summary: CaseWarningRunResult = {
    scanned: 0,
    evaluated: 0,
    dispatched: emptyCounts(),
    skipped_already_sent: 0,
    errors: [],
    duration_ms: 0,
  };

  // Universo: casos halt o waiting con halted_at conocido. updatedAt como
  // alternativa para WAITING_CUOTAS (que no siempre setean halted_at).
  const tenDaysAgo = new Date(now.getTime() - CASE_WARNING_THRESHOLDS_DAYS.WARNING_10 * 86_400_000);
  const cases = await withSystemRls((tx) =>
    tx.case.findMany({
      where: {
        OR: [
          { stage: CaseStage.HALTED_BY_PAYMENT, halted_at: { lte: tenDaysAgo } },
          {
            stage: CaseStage.WAITING_CUOTAS,
            halted_at: null,
            updatedAt: { lte: tenDaysAgo },
          },
        ],
      },
      include: {
        warnings: { select: { level: true } },
      },
    }),
  );

  summary.scanned = cases.length;

  for (const c of cases) {
    const referenceDate = c.halted_at ?? c.updatedAt;
    const dias = Math.floor((now.getTime() - referenceDate.getTime()) / 86_400_000);
    const level = computeCaseWarningLevel(dias);
    if (!level) continue;
    summary.evaluated += 1;

    if (c.warnings.some((w) => w.level === level)) {
      summary.skipped_already_sent += 1;
      continue;
    }

    try {
      await dispatchCaseWarning({ caseId: c.id, clientId: c.client_id, level, dias, now });
      summary.dispatched[level] += 1;
    } catch (err) {
      summary.errors.push({
        case_id: c.id,
        level,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  summary.duration_ms = Date.now() - startedAt;
  return summary;
}

async function dispatchCaseWarning(params: {
  caseId: string;
  clientId: string;
  level: CaseWarningLevel;
  dias: number;
  now: Date;
}) {
  const { caseId, clientId, level, dias, now } = params;

  // Reservar slot — race-safe contra ejecuciones paralelas.
  let warning;
  try {
    warning = await withSystemRls((tx) =>
      tx.caseWarning.create({
        data: {
          caseId,
          level,
          dias_halted_at_send: dias,
          channel: "BOTH",
          delivery_status: "PENDING",
        },
      }),
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
    throw err;
  }

  // Notificación + side effects en una transacción que envuelve audit.
  const result: { status: "SENT" | "FAILED"; error?: string } = { status: "SENT" };
  let sideEffectsApplied = false;
  try {
    await withSystemRls(async (tx) => {
      if (level === "WARNING_10") {
        await enqueueWhatsApp({ kind: "non_payment_warning", caseId });
        await enqueueEmail({ kind: "non_payment_warning", caseId });
        await logAudit({
          tx,
          action: "EMAIL_SENT",
          caseId,
          message: `Warning 10 días: recordatorio automático enviado (mora ${dias}d).`,
          metadata: JSON.stringify({ level, dias }),
        });
      } else if (level === "WARNING_20") {
        await enqueueWhatsApp({ kind: "overdue_notice", caseId });
        await enqueueEmail({ kind: "overdue_notice", caseId });
        await logAudit({
          tx,
          action: "EMAIL_SENT",
          caseId,
          message: `Warning 20 días: aviso crítico automático (mora ${dias}d).`,
          metadata: JSON.stringify({ level, dias }),
        });
      } else if (level === "WARNING_30") {
        // Corte automático. Defensivo: sólo aplica si aún está activo.
        await enqueueWhatsApp({ kind: "overdue_notice", caseId });
        await enqueueEmail({ kind: "overdue_notice", caseId });
        await tx.case.update({
          where: { id: caseId },
          data: {
            unpaid_months: { set: 3 },
            stage: CaseStage.HALTED_BY_PAYMENT,
            halted_at: now,
            halted_reason: `Mora 30 días: corte automático por impago (cron).`,
          },
        });
        await tx.user.update({
          where: { id: clientId },
          data: { active: false },
        });
        sideEffectsApplied = true;
        await logAudit({
          tx,
          action: "CASE_HALTED",
          caseId,
          message: `Warning 30 días: corte automático ejecutado. Cuenta cliente desactivada.`,
          metadata: JSON.stringify({ level, dias }),
        });
      }
    });
  } catch (err) {
    result.status = "FAILED";
    result.error = err instanceof Error ? err.message : String(err);
  }

  await withSystemRls((tx) =>
    tx.caseWarning.update({
      where: { id: warning.id },
      data: {
        delivery_status: result.status,
        delivery_error: result.error ?? null,
        side_effects_applied: sideEffectsApplied,
        sent_at: result.status === "SENT" ? now : null,
      },
    }),
  );

  if (result.status === "FAILED") throw new Error(result.error);
}
