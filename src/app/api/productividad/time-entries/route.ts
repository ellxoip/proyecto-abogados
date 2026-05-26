import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { ActivityCategory, Role, CaseStage } from "@/lib/db-enums";
import { z } from "zod";
import { differenceInCalendarDays } from "date-fns";

// ── Anti-fraude · reglas y umbrales ────────────────────────────────────────
const DAILY_CAP_MINUTES = 1440;                  // tope físico: 24 h
const DAILY_OVERWORK_THRESHOLD_MINUTES = 600;    // > 10 h en un día → score +25
const LONG_ENTRY_MINUTES = 480;                  // > 8 h en una sola entrada → requiere justificación
const LATE_ENTRY_DAYS = 14;                      // > 14 días tarde → requiere justificación
const DUPLICATE_WINDOW_MS = 60_000;              // 60 s desde la creación → posible doble click
const NIGHT_REGISTRATION_HOURS = { start: 0, end: 5 }; // creación entre 00:00–05:00 → +10 al score

const CreateSchema = z.object({
  caseId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMinutes: z.number().int().min(1).max(1440),
  category: z.nativeEnum(ActivityCategory),
  description: z.string().max(500).optional(),
  // Campos de justificación — sólo se exigen cuando el endpoint los marca como necesarios.
  lateReason: z.string().min(20).max(500).optional(),
  longEntryReason: z.string().min(20).max(500).optional(),
  closedCaseReason: z.string().min(20).max(500).optional(),
  // El cliente debe declarar haber aceptado los avisos antifraude (UI consciente)
  acknowledgedFraudWarnings: z.boolean().optional(),
});

type RiskFactor = { code: string; label: string; weight: number };

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const caseId = searchParams.get("caseId");
    const lawyerId = searchParams.get("lawyerId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // Sólo SuperAdmin puede listar entradas de OTROS abogados o agregadas globales.
    // Cualquier otro rol queda restringido a sus propias entradas.
    const canSeeAll = session.user.role === Role.SUPER_ADMIN;

    const effectiveLawyerId = canSeeAll ? lawyerId ?? undefined : session.user.id;

    const entries = await withRls(async (tx) => {
      return tx.timeEntry.findMany({
        where: {
          ...(caseId ? { caseId } : {}),
          ...(effectiveLawyerId ? { lawyerId: effectiveLawyerId } : {}),
          ...(from || to
            ? {
                date: {
                  ...(from ? { gte: new Date(from) } : {}),
                  ...(to ? { lte: new Date(to) } : {}),
                },
              }
            : {}),
        },
        include: {
          lawyer: { select: { id: true, fullName: true } },
          case: { select: { id: true, code: true } },
        },
        orderBy: { date: "desc" },
      });
    });

    return NextResponse.json({ entries });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const {
      caseId,
      date,
      durationMinutes,
      category,
      description,
      lateReason,
      longEntryReason,
      closedCaseReason,
      acknowledgedFraudWarnings,
    } = parsed.data;

    const now = new Date();
    const entryDate = new Date(date + "T12:00:00Z");
    // Comparamos por día calendario UTC: ambos anchorados a 12:00Z para
    // que la fecha "hoy" no se rechace si el cliente registra antes de
    // mediodía local (Chile = UTC-3, 12:00Z = 9:00 local).
    const todayCalendarDate = new Date(now.toISOString().slice(0, 10) + "T12:00:00Z");
    if (entryDate.getTime() > todayCalendarDate.getTime()) {
      return NextResponse.json(
        { error: "La fecha no puede ser futura.", code: "FUTURE_DATE" },
        { status: 400 },
      );
    }

    const daysLate = Math.max(0, differenceInCalendarDays(now, entryDate));
    const isLateEntry = daysLate > LATE_ENTRY_DAYS;
    const isLongEntry = durationMinutes > LONG_ENTRY_MINUTES;

    const result = await withRls(async (tx) => {
      // 1. Caso debe existir y el abogado tiene que estar asignado (o ser admin/jefe)
      const kase = await tx.case.findUnique({
        where: { id: caseId },
        select: {
          id: true,
          code: true,
          stage: true,
          abogados: { select: { id: true } },
        },
      });
      if (!kase) {
        return { kind: "error" as const, status: 404, body: { error: "Expediente no encontrado." } };
      }

      const isAssigned = kase.abogados.some((a) => a.id === session.user.id);
      const isPrivileged =
        session.user.role === Role.SUPER_ADMIN || session.user.role === Role.JEFE_DE_MESA;
      if (!isAssigned && !isPrivileged) {
        return {
          kind: "error" as const,
          status: 403,
          body: { error: "No tienes acceso a este expediente.", code: "NOT_ASSIGNED" },
        };
      }

      const isClosedCase =
        kase.stage === CaseStage.FINISHED || kase.stage === CaseStage.HALTED_BY_PAYMENT;

      // 2. Anti-duplicado · misma firma en los últimos 60 s probablemente es un doble click
      const duplicateCutoff = new Date(now.getTime() - DUPLICATE_WINDOW_MS);
      const recentDuplicate = await tx.timeEntry.findFirst({
        where: {
          lawyerId: session.user.id,
          caseId,
          date: entryDate,
          durationMinutes,
          category,
          createdAt: { gte: duplicateCutoff },
        },
        select: { id: true, createdAt: true },
      });
      if (recentDuplicate) {
        return {
          kind: "error" as const,
          status: 409,
          body: {
            error:
              "Detectamos una entrada idéntica registrada hace menos de un minuto. ¿Hiciste doble click? Espera o ajusta los datos antes de reintentar.",
            code: "DUPLICATE_RECENT",
            duplicateEntryId: recentDuplicate.id,
          },
        };
      }

      // 3. Tope diario duro · no puede sumar más de 24h en el día
      const dayStart = new Date(entryDate);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(entryDate);
      dayEnd.setUTCHours(23, 59, 59, 999);

      const dayAggregate = await tx.timeEntry.aggregate({
        _sum: { durationMinutes: true },
        _count: { id: true },
        where: {
          lawyerId: session.user.id,
          date: { gte: dayStart, lte: dayEnd },
        },
      });
      const existingDayMinutes = dayAggregate._sum.durationMinutes ?? 0;
      const existingDayEntries = dayAggregate._count.id ?? 0;
      const projectedDayMinutes = existingDayMinutes + durationMinutes;

      if (projectedDayMinutes > DAILY_CAP_MINUTES) {
        const restanteHoras = ((DAILY_CAP_MINUTES - existingDayMinutes) / 60).toFixed(2);
        return {
          kind: "error" as const,
          status: 409,
          body: {
            error: `Tope diario superado: ya tienes ${(existingDayMinutes / 60).toFixed(
              2,
            )} h registradas para ese día. Máximo restante: ${restanteHoras} h.`,
            code: "DAILY_CAP_EXCEEDED",
            existingDayMinutes,
            cap: DAILY_CAP_MINUTES,
          },
        };
      }

      // 4. Reglas blandas con justificación obligatoria — devolvemos un detalle granular
      //    para que la UI muestre los campos correspondientes y el usuario complete.
      const missingJustifications: Array<{
        code: string;
        field: string;
        message: string;
      }> = [];
      if (isLateEntry && !lateReason) {
        missingJustifications.push({
          code: "LATE_ENTRY_REQUIRES_REASON",
          field: "lateReason",
          message: `Esta entrada tiene ${daysLate} días de retraso. Explica el motivo (mínimo 20 caracteres).`,
        });
      }
      if (isLongEntry && !longEntryReason) {
        missingJustifications.push({
          code: "LONG_ENTRY_REQUIRES_REASON",
          field: "longEntryReason",
          message: `Esta entrada supera las ${LONG_ENTRY_MINUTES / 60} h continuas. Detalla el alcance del trabajo (mínimo 20 caracteres).`,
        });
      }
      if (isClosedCase && !closedCaseReason) {
        missingJustifications.push({
          code: "CLOSED_CASE_REQUIRES_REASON",
          field: "closedCaseReason",
          message: `El expediente está en estado ${kase.stage}. Explica por qué se registran horas sobre un caso cerrado (mínimo 20 caracteres).`,
        });
      }

      if (missingJustifications.length > 0 && !acknowledgedFraudWarnings) {
        return {
          kind: "error" as const,
          status: 422,
          body: {
            error: "Se requieren justificaciones adicionales para esta entrada.",
            code: "JUSTIFICATION_REQUIRED",
            missing: missingJustifications,
          },
        };
      }

      // 5. Composición del riesgo · suma ponderada de factores
      const factors: RiskFactor[] = [];
      if (isLateEntry) factors.push({ code: "LATE_ENTRY", label: `Entrada tardía (${daysLate} d)`, weight: 30 });
      if (isLongEntry) factors.push({ code: "LONG_ENTRY", label: `Entrada larga (${(durationMinutes / 60).toFixed(1)} h)`, weight: 25 });
      if (projectedDayMinutes > DAILY_OVERWORK_THRESHOLD_MINUTES) {
        factors.push({
          code: "DAILY_OVERWORK",
          label: `Día con sobrecarga (${(projectedDayMinutes / 60).toFixed(1)} h totales)`,
          weight: 25,
        });
      }
      if (isClosedCase) factors.push({ code: "CLOSED_CASE", label: `Caso ${kase.stage}`, weight: 20 });
      if (!description || description.trim().length < 10) {
        factors.push({ code: "NO_DESCRIPTION", label: "Sin descripción suficiente", weight: 15 });
      }
      if (category === ActivityCategory.OTRO && (!description || description.trim().length < 20)) {
        factors.push({ code: "OTRO_UNDETAILED", label: '"Otro" sin detalle', weight: 10 });
      }
      const hour = now.getUTCHours();
      if (hour >= NIGHT_REGISTRATION_HOURS.start && hour < NIGHT_REGISTRATION_HOURS.end) {
        factors.push({ code: "NIGHT_REGISTRATION", label: "Registrado en horario nocturno", weight: 10 });
      }
      if (existingDayEntries >= 3) {
        factors.push({
          code: "HIGH_ENTRY_VELOCITY",
          label: `${existingDayEntries + 1}ª entrada del día`,
          weight: 5 + Math.min(20, existingDayEntries * 2),
        });
      }

      const riskScore = Math.min(
        100,
        factors.reduce((sum, f) => sum + f.weight, 0),
      );
      const riskBand = riskScore >= 60 ? "HIGH" : riskScore >= 30 ? "MEDIUM" : "LOW";

      // 6. Persistir · entrada + bitácora forense en la misma transacción
      const entry = await tx.timeEntry.create({
        data: {
          caseId,
          lawyerId: session.user.id,
          date: entryDate,
          durationMinutes,
          category,
          description: description || null,
        },
        include: { lawyer: { select: { id: true, fullName: true } } },
      });

      const justifications: Record<string, string> = {};
      if (lateReason) justifications.lateReason = lateReason;
      if (longEntryReason) justifications.longEntryReason = longEntryReason;
      if (closedCaseReason) justifications.closedCaseReason = closedCaseReason;

      const auditMetadata = {
        timeEntryId: entry.id,
        caseId,
        caseCode: kase.code,
        caseStage: kase.stage,
        date,
        durationMinutes,
        category,
        descriptionLength: (description ?? "").length,
        daysLate,
        existingDayMinutes,
        projectedDayMinutes,
        existingDayEntries: existingDayEntries + 1,
        riskScore,
        riskBand,
        factors,
        justifications,
        clientIp: clientIp(req),
        userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
        acknowledgedFraudWarnings: !!acknowledgedFraudWarnings,
      };

      await tx.auditLog.create({
        data: {
          action: riskBand === "HIGH" ? "TIME_ENTRY_FLAGGED" : "TIME_ENTRY_LOGGED",
          caseId,
          actorId: session.user.id,
          channel: "system",
          template: "time-entry",
          status: riskBand === "HIGH" ? "flagged" : "ok",
          message:
            riskBand === "HIGH"
              ? `[ALTO RIESGO] Entrada ${entry.id} marcada para revisión del SuperAdmin (score ${riskScore}).`
              : `Entrada de tiempo registrada (${(durationMinutes / 60).toFixed(2)} h · score ${riskScore}).`,
          metadata: JSON.stringify(auditMetadata),
        },
      });

      return {
        kind: "ok" as const,
        body: {
          entry,
          riskScore,
          riskBand,
          factors,
          dayTotalMinutes: projectedDayMinutes,
          flagged: riskBand === "HIGH",
        },
      };
    });

    if (result.kind === "error") {
      return NextResponse.json(result.body, { status: result.status });
    }
    return NextResponse.json(result.body, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
