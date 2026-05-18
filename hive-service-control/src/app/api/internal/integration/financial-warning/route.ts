import { NextResponse } from "next/server";
import { z } from "zod";
import { withSystemRls } from "@/lib/rls";
import { CaseStage, Role } from "@/lib/db-enums";
import { enqueueWhatsApp, enqueueEmail } from "@/lib/notifications";
import { forceHalt } from "@/lib/case-health";
import { logAudit } from "@/lib/audit";

/**
 * POST /api/internal/integration/financial-warning
 *
 * Recibe alertas de morosidad emitidas por hive-financial-control:
 *   - WARNING_10 → recordatorio (WhatsApp + Email).
 *   - WARNING_20 → aviso crítico (WhatsApp + Email).
 *   - WARNING_30 → corte: forceHalt del caso + user.active = false.
 *
 * Idempotencia: financial-control no envía dos veces el mismo (cuota_id, level)
 * gracias al unique en CuotaWarning. Este endpoint además es defensivo: no
 * vuelve a desactivar al usuario si ya está inactivo, ni vuelve a HALT si el
 * caso ya está en HALTED_BY_PAYMENT.
 *
 * Auth: bearer/x-api-key igual a `INTEGRATION_INTERNAL_API_KEY`.
 */

function assertIntegrationAuth(req: Request) {
  const expected = process.env.INTEGRATION_INTERNAL_API_KEY ?? null;
  if (!expected) throw new Error("INTEGRATION_INTERNAL_API_KEY no configurado.");
  const apiKey = req.headers.get("x-api-key");
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if ((apiKey && apiKey === expected) || (bearer && bearer === expected)) return;
  throw new Error("No autorizado.");
}

const schema = z.object({
  source: z.string().optional(),
  warning_id: z.number().int().optional(),
  level: z.enum(["WARNING_10", "WARNING_20", "WARNING_30"]),
  dias_atraso: z.number().int().nonnegative(),
  cliente: z.object({
    id: z.number().int(),
    rut: z.string().min(1),
    nombre: z.string().min(1),
    email: z.string().email().nullable().optional(),
    telefono: z.string().nullable().optional(),
  }),
  contrato: z.object({
    id: z.number().int(),
    external_id: z.string().nullable().optional(),
    estado: z.string().optional(),
  }),
  cuota: z.object({
    id: z.number().int(),
    numero_cuota: z.number().int(),
    fecha_vencimiento: z.string(),
    monto_original: z.string().optional(),
    saldo_pendiente: z.string().optional(),
  }),
});

function normalizeRut(rut: string): string {
  return rut.replace(/\./g, "").toLowerCase().trim();
}

export async function POST(req: Request) {
  try {
    assertIntegrationAuth(req);
  } catch {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body JSON inválido." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Payload inválido.", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { level, dias_atraso, cliente, contrato, cuota } = parsed.data;
  const rut = normalizeRut(cliente.rut);

  try {
    const result = await withSystemRls(async (tx) => {
      // 1. Localizar al cliente en hive-service-control por RUT.
      const clientUser = await tx.user.findFirst({
        where: { rut, role: Role.CLIENTE },
        select: { id: true, active: true, email: true },
      });

      if (!clientUser) {
        return {
          matched: false as const,
          reason: `Cliente RUT ${rut} no existe en hive-service-control. Caso aún no migrado.`,
        };
      }

      // 2. Encontrar el caso "vivo" del cliente — preferimos el más reciente.
      const kase = await tx.case.findFirst({
        where: {
          client_id: clientUser.id,
          stage: { notIn: [CaseStage.FINISHED] },
        },
        orderBy: { updatedAt: "desc" },
        select: { id: true, code: true, stage: true, is_paid: true },
      });

      if (!kase) {
        return {
          matched: false as const,
          reason: `Cliente ${rut} no tiene casos activos. Sólo se enviarán avisos por canal de cliente.`,
        };
      }

      // 3. Despachar según el nivel.
      const messageMeta = {
        level,
        dias_atraso,
        cuota_id: cuota.id,
        numero_cuota: cuota.numero_cuota,
        contrato_id: contrato.id,
      };

      if (level === "WARNING_10") {
        await enqueueWhatsApp({ kind: "non_payment_warning", caseId: kase.id });
        await enqueueEmail({ kind: "non_payment_warning", caseId: kase.id });
        await logAudit({
          tx,
          action: "EMAIL_SENT",
          caseId: kase.id,
          message: `Warning 10 días — cuota #${cuota.numero_cuota} (atraso ${dias_atraso}d)`,
          metadata: messageMeta,
        });
      } else if (level === "WARNING_20") {
        await enqueueWhatsApp({ kind: "overdue_notice", caseId: kase.id });
        await enqueueEmail({ kind: "overdue_notice", caseId: kase.id });
        await logAudit({
          tx,
          action: "EMAIL_SENT",
          caseId: kase.id,
          message: `Warning 20 días — aviso crítico cuota #${cuota.numero_cuota} (atraso ${dias_atraso}d)`,
          metadata: messageMeta,
        });
      } else if (level === "WARNING_30") {
        // Corte efectivo. Defensivo: sólo halteamos si aún está activo.
        if (kase.stage !== CaseStage.HALTED_BY_PAYMENT) {
          await forceHalt(
            tx,
            kase.id,
            `Mora 30 días: corte por impago de cuota #${cuota.numero_cuota}.`,
          );
        } else {
          await enqueueWhatsApp({ kind: "overdue_notice", caseId: kase.id });
          await enqueueEmail({ kind: "overdue_notice", caseId: kase.id });
        }
        if (clientUser.active) {
          await tx.user.update({
            where: { id: clientUser.id },
            data: { active: false },
          });
        }
        await logAudit({
          tx,
          action: "CASE_HALTED",
          caseId: kase.id,
          message: `Warning 30 días — corte de servicio y cuenta desactivada por mora.`,
          metadata: messageMeta,
        });
      }

      return {
        matched: true as const,
        caseId: kase.id,
        caseCode: kase.code,
        stage: kase.stage,
        action: level,
      };
    });

    if (!result.matched) {
      return NextResponse.json({ ok: true, ...result }, { status: 202 });
    }
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
