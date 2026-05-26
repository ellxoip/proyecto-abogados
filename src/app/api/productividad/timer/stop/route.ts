import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { ActivityCategory, Role, CaseStage } from "@/lib/db-enums";
import { z } from "zod";
import { differenceInCalendarDays } from "date-fns";
import {
  DAILY_CAP_MINUTES,
  LATE_ENTRY_DAYS,
  LONG_ENTRY_MINUTES,
  TIMER_HARD_CAP_MS,
} from "@/lib/productividad/timer-policy";
import { appendEvent, computeCurrentDurationMs } from "@/lib/productividad/timer-state";

const Body = z.object({
  discard: z.boolean().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  durationMinutes: z.number().int().min(1).max(DAILY_CAP_MINUTES).optional(),
  category: z.nativeEnum(ActivityCategory).optional(),
  description: z.string().max(500).optional(),
  lateReason: z.string().min(20).max(500).optional(),
  longEntryReason: z.string().min(20).max(500).optional(),
  closedCaseReason: z.string().min(20).max(500).optional(),
  discardReason: z.string().min(10).max(500).optional(),
  acknowledgedFraudWarnings: z.boolean().optional(),
});

type RiskFactor = { code: string; label: string; weight: number };

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

const NIGHT_HOURS = { start: 0, end: 5 };
const DAILY_OVERWORK_THRESHOLD = 600;

/**
 * POST /api/productividad/timer/stop
 *
 * Closes the currently-open timer session. Two flavours:
 *
 *  - { discard: true, discardReason }  → no TimeEntry created · session DISCARDED.
 *  - { description, category, ... }   → creates a TimeEntry through the same
 *    anti-fraud pipeline used by the manual POST, marks session COMPLETED
 *    (or FLAGGED when the risk score is HIGH), and writes a TIMER_CLOSED
 *    AuditLog row pointing at the resulting TimeEntry id. All in one
 *    transaction.
 *
 * The server is the *only* authority for the duration: we read the persisted
 * session, compute `currentDurationMs` from server timestamps, and ignore the
 * client-suggested durationMinutes when it disagrees by more than ±5 minutes.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  if (session.user.role === Role.CLIENTE) {
    return NextResponse.json({ ok: false, error: "Acceso restringido" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;
  const now = new Date();

  const result = await withRls(async (tx) => {
    const open = await tx.timerSession.findFirst({
      where: {
        lawyerId: session.user.id,
        status: { in: ["ACTIVE", "PAUSED", "PENDING_CLOSE"] },
      },
      include: {
        case: { select: { id: true, code: true, stage: true } },
      },
    });
    if (!open) {
      return { kind: "no_session" as const };
    }

    // 1. Compute the server-authoritative duration.
    const serverDurationMs = Math.min(
      TIMER_HARD_CAP_MS,
      computeCurrentDurationMs(
        {
          status: open.status,
          accumulatedMs: open.accumulatedMs,
          lastResumedAt: open.lastResumedAt ?? null,
        },
        now,
      ),
    );
    const serverDurationMinutes = Math.max(1, Math.round(serverDurationMs / 60000));

    // 2. Branch: discard.
    if (input.discard) {
      if (!input.discardReason || input.discardReason.trim().length < 10) {
        return {
          kind: "error" as const,
          status: 422,
          body: {
            ok: false,
            code: "DISCARD_REASON_REQUIRED",
            error: "Para descartar la sesión debes indicar un motivo (mínimo 10 caracteres).",
          },
        };
      }
      const updated = await tx.timerSession.update({
        where: { id: open.id },
        data: {
          status: "DISCARDED",
          endedAt: now,
          accumulatedMs: serverDurationMs,
          lastResumedAt: null,
          closeReason: "discarded_by_user",
          eventsJson: appendEvent(open.eventsJson, {
            kind: "discarded",
            at: now.toISOString(),
            detail: { reason: input.discardReason, accumulatedMs: serverDurationMs },
          }),
        },
      });
      await tx.auditLog.create({
        data: {
          action: "TIMER_DISCARDED",
          caseId: open.caseId,
          actorId: session.user.id,
          channel: "system",
          template: "timer-session",
          status: "ok",
          message: `Sesión descartada por el abogado tras ${serverDurationMinutes} min.`,
          metadata: JSON.stringify({
            timerSessionId: open.id,
            reason: input.discardReason,
            accumulatedMs: serverDurationMs,
            serverDurationMinutes,
          }),
        },
      });
      return { kind: "discarded" as const, body: { ok: true, status: "DISCARDED", session: updated } };
    }

    // 3. Branch: convert to TimeEntry. Validate inputs first.
    const description = input.description ?? "";
    const category = input.category ?? ActivityCategory.OTRO;
    const dateStr = input.date ?? open.startedAt.toISOString().slice(0, 10);
    const entryDate = new Date(dateStr + "T12:00:00Z");
    // Comparamos por día calendario UTC, no por timestamp crudo. Antes la
    // entryDate quedaba fijada a 12:00Z (9:00 chileno) y, si el cliente
    // registraba antes de mediodía local, `entryDate > now` rechazaba un
    // día que NO es futuro. Ahora `today` también se ancla a 12:00Z para
    // un compare directo de mismo día.
    const todayCalendarDate = new Date(now.toISOString().slice(0, 10) + "T12:00:00Z");
    if (entryDate.getTime() > todayCalendarDate.getTime()) {
      return {
        kind: "error" as const,
        status: 400,
        body: { ok: false, error: "La fecha no puede ser futura.", code: "FUTURE_DATE" },
      };
    }

    // Trust the server. If the client tried to pass a different duration,
    // accept only ±5 min drift before treating it as a tampering attempt.
    const clientMinutes = input.durationMinutes;
    let finalMinutes = serverDurationMinutes;
    if (typeof clientMinutes === "number") {
      if (Math.abs(clientMinutes - serverDurationMinutes) > 5) {
        // We don't fail — we just stick to the server count and flag it.
        finalMinutes = serverDurationMinutes;
      } else {
        finalMinutes = clientMinutes;
      }
    }
    if (finalMinutes < 1) {
      return {
        kind: "error" as const,
        status: 400,
        body: { ok: false, error: "Duración inferior a 1 minuto." },
      };
    }

    // Daily cap (sum of existing entries that day) — mirrors the manual POST.
    const dayStart = new Date(entryDate);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(entryDate);
    dayEnd.setUTCHours(23, 59, 59, 999);
    const dayAggregate = await tx.timeEntry.aggregate({
      _sum: { durationMinutes: true },
      _count: { id: true },
      where: { lawyerId: session.user.id, date: { gte: dayStart, lte: dayEnd } },
    });
    const existingDayMinutes = dayAggregate._sum.durationMinutes ?? 0;
    const existingDayEntries = dayAggregate._count.id ?? 0;
    const projectedDayMinutes = existingDayMinutes + finalMinutes;
    if (projectedDayMinutes > DAILY_CAP_MINUTES) {
      return {
        kind: "error" as const,
        status: 409,
        body: {
          ok: false,
          code: "DAILY_CAP_EXCEEDED",
          error: `Tope diario excedido: ya tienes ${(existingDayMinutes / 60).toFixed(2)} h registradas ese día.`,
        },
      };
    }

    const daysLate = Math.max(0, differenceInCalendarDays(now, entryDate));
    const isLate = daysLate > LATE_ENTRY_DAYS;
    const isLong = finalMinutes > LONG_ENTRY_MINUTES;
    const isClosedCase =
      open.case.stage === CaseStage.FINISHED || open.case.stage === CaseStage.HALTED_BY_PAYMENT;

    const missing: Array<{ code: string; field: string; message: string }> = [];
    if (isLate && !input.lateReason) {
      missing.push({
        code: "LATE_ENTRY_REQUIRES_REASON",
        field: "lateReason",
        message: `Esta sesión tiene ${daysLate} días de retraso. Explica el motivo (mínimo 20 caracteres).`,
      });
    }
    if (isLong && !input.longEntryReason) {
      missing.push({
        code: "LONG_ENTRY_REQUIRES_REASON",
        field: "longEntryReason",
        message: `La duración supera ${LONG_ENTRY_MINUTES / 60} h continuas. Detalla el alcance (mínimo 20 caracteres).`,
      });
    }
    if (isClosedCase && !input.closedCaseReason) {
      missing.push({
        code: "CLOSED_CASE_REQUIRES_REASON",
        field: "closedCaseReason",
        message: `El expediente está en ${open.case.stage}. Explica por qué se registran horas sobre un caso cerrado (mínimo 20 caracteres).`,
      });
    }
    if (missing.length > 0 && !input.acknowledgedFraudWarnings) {
      return {
        kind: "error" as const,
        status: 422,
        body: {
          ok: false,
          code: "JUSTIFICATION_REQUIRED",
          error: "Se requieren justificaciones adicionales para esta sesión.",
          missing,
        },
      };
    }

    // 4. Compute risk factors (server-side authority).
    const factors: RiskFactor[] = [];
    if (isLate) factors.push({ code: "LATE_ENTRY", label: `Cierre tardío (${daysLate} d)`, weight: 30 });
    if (isLong) factors.push({ code: "LONG_ENTRY", label: `Sesión larga (${(finalMinutes / 60).toFixed(1)} h)`, weight: 25 });
    if (projectedDayMinutes > DAILY_OVERWORK_THRESHOLD) {
      factors.push({
        code: "DAILY_OVERWORK",
        label: `Día con sobrecarga (${(projectedDayMinutes / 60).toFixed(1)} h totales)`,
        weight: 25,
      });
    }
    if (isClosedCase) factors.push({ code: "CLOSED_CASE", label: `Caso ${open.case.stage}`, weight: 20 });
    if (!description || description.trim().length < 10) {
      factors.push({ code: "NO_DESCRIPTION", label: "Sin descripción suficiente", weight: 15 });
    }
    if (category === ActivityCategory.OTRO && (!description || description.trim().length < 20)) {
      factors.push({ code: "OTRO_UNDETAILED", label: '"Otro" sin detalle', weight: 10 });
    }
    const hour = now.getUTCHours();
    if (hour >= NIGHT_HOURS.start && hour < NIGHT_HOURS.end) {
      factors.push({ code: "NIGHT_REGISTRATION", label: "Cerrado en horario nocturno", weight: 10 });
    }
    if (existingDayEntries >= 3) {
      factors.push({
        code: "HIGH_ENTRY_VELOCITY",
        label: `${existingDayEntries + 1}ª entrada del día`,
        weight: 5 + Math.min(20, existingDayEntries * 2),
      });
    }
    // Timer-specific factors
    if (open.warned10h) factors.push({ code: "TIMER_OVER_10H", label: "Cronómetro superó 10 h activas", weight: 25 });
    else if (open.warned8h) factors.push({ code: "TIMER_OVER_8H", label: "Cronómetro superó 8 h activas", weight: 15 });
    if (open.autoPausedAt) factors.push({ code: "TIMER_AUTO_PAUSED", label: "Cronómetro auto-pausado por el sistema", weight: 20 });
    if (typeof clientMinutes === "number" && Math.abs(clientMinutes - serverDurationMinutes) > 5) {
      factors.push({
        code: "DURATION_DISCREPANCY",
        label: `Cliente reportó ${clientMinutes} min vs servidor ${serverDurationMinutes} min`,
        weight: 25,
      });
    }

    const riskScore = Math.min(100, factors.reduce((s, f) => s + f.weight, 0));
    const riskBand: "LOW" | "MEDIUM" | "HIGH" = riskScore >= 60 ? "HIGH" : riskScore >= 30 ? "MEDIUM" : "LOW";

    // 5. Persist TimeEntry + close session + audit, all in this single tx.
    const entry = await tx.timeEntry.create({
      data: {
        caseId: open.caseId,
        lawyerId: session.user.id,
        date: entryDate,
        durationMinutes: finalMinutes,
        category,
        description: description.trim() || null,
      },
    });

    const justifications: Record<string, string> = {};
    if (input.lateReason) justifications.lateReason = input.lateReason;
    if (input.longEntryReason) justifications.longEntryReason = input.longEntryReason;
    if (input.closedCaseReason) justifications.closedCaseReason = input.closedCaseReason;

    const closeReason = open.autoPausedAt ? "auto_cap_12h" : "user_stop";
    const finalStatus = riskBand === "HIGH" ? "FLAGGED" : "COMPLETED";

    const updatedSession = await tx.timerSession.update({
      where: { id: open.id },
      data: {
        status: finalStatus,
        endedAt: now,
        accumulatedMs: Math.round(finalMinutes * 60000),
        lastResumedAt: null,
        resultingTimeEntryId: entry.id,
        riskScore,
        riskBand,
        closeReason,
        eventsJson: appendEvent(open.eventsJson, {
          kind: finalStatus === "FLAGGED" ? "stopped" : "completed",
          at: now.toISOString(),
          detail: {
            timeEntryId: entry.id,
            riskScore,
            riskBand,
            durationMinutes: finalMinutes,
            serverDurationMinutes,
            clientMinutes: clientMinutes ?? null,
            factors,
            justifications,
          },
        }),
      },
    });

    await tx.auditLog.create({
      data: {
        action: riskBand === "HIGH" ? "TIMER_ENTRY_FLAGGED" : "TIMER_ENTRY_LOGGED",
        caseId: open.caseId,
        actorId: session.user.id,
        channel: "system",
        template: "timer-session",
        status: riskBand === "HIGH" ? "flagged" : "ok",
        message:
          riskBand === "HIGH"
            ? `[ALTO RIESGO] Sesión convertida a TimeEntry ${entry.id} (score ${riskScore}, ${(finalMinutes / 60).toFixed(2)} h).`
            : `Sesión convertida a TimeEntry ${entry.id} (${(finalMinutes / 60).toFixed(2)} h, score ${riskScore}).`,
        metadata: JSON.stringify({
          timerSessionId: open.id,
          timeEntryId: entry.id,
          caseCode: open.case.code,
          caseStage: open.case.stage,
          durationMinutes: finalMinutes,
          serverDurationMinutes,
          clientDurationMinutes: clientMinutes ?? null,
          riskScore,
          riskBand,
          factors,
          justifications,
          existingDayMinutes,
          projectedDayMinutes,
          existingDayEntries: existingDayEntries + 1,
          warned4h: open.warned4h,
          warned8h: open.warned8h,
          warned10h: open.warned10h,
          autoPausedAt: open.autoPausedAt?.toISOString() ?? null,
          ip: clientIp(req),
          userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
          acknowledgedFraudWarnings: !!input.acknowledgedFraudWarnings,
        }),
      },
    });

    return {
      kind: "completed" as const,
      body: {
        ok: true,
        status: finalStatus,
        session: updatedSession,
        timeEntry: entry,
        riskScore,
        riskBand,
        factors,
        durationMinutes: finalMinutes,
        serverDurationMinutes,
        flagged: riskBand === "HIGH",
      },
    };
  });

  if (result.kind === "no_session") {
    return NextResponse.json({ ok: false, error: "No hay sesión abierta para cerrar." }, { status: 404 });
  }
  if (result.kind === "error") {
    return NextResponse.json(result.body, { status: result.status });
  }
  return NextResponse.json(result.body, { status: 200 });
}
