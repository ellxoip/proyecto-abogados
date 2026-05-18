import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { Role } from "@/lib/db-enums";
import {
  TIMER_AUTO_CAP_MS,
  TIMER_HARD_CAP_MS,
} from "@/lib/productividad/timer-policy";
import {
  appendEvent,
  computeCurrentDurationMs,
  pendingWarnings,
} from "@/lib/productividad/timer-state";

/**
 * POST /api/productividad/timer/heartbeat
 *
 * The active widget pings this endpoint every ~30s while the timer is ACTIVE.
 * Server-side responsibilities on each ping:
 *   1. Update `lastHeartbeatAt`.
 *   2. Mark crossed warning thresholds (4h/8h/10h) as fired and emit events.
 *   3. Auto-pause the session at 12h (TIMER_AUTO_CAP_MS) into PENDING_CLOSE.
 *   4. Hard-stop at TIMER_HARD_CAP_MS (forces PENDING_CLOSE; cannot continue).
 *
 * The response carries the freshly computed currentDurationMs and the new
 * warning state so the UI can react immediately.
 */
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  if (session.user.role === Role.CLIENTE) {
    return NextResponse.json({ ok: false, error: "Acceso restringido" }, { status: 403 });
  }

  const now = new Date();
  const result = await withRls(async (tx) => {
    const open = await tx.timerSession.findFirst({
      where: { lawyerId: session.user.id, status: { in: ["ACTIVE", "PAUSED", "PENDING_CLOSE"] } },
    });
    if (!open) return { kind: "no_session" as const };

    // Nothing dynamic happens unless the timer is actually counting.
    if (open.status !== "ACTIVE") {
      const current = computeCurrentDurationMs(
        { status: open.status, accumulatedMs: open.accumulatedMs, lastResumedAt: open.lastResumedAt ?? null },
        now,
      );
      const updated = await tx.timerSession.update({
        where: { id: open.id },
        data: { lastHeartbeatAt: now },
      });
      return {
        kind: "ok" as const,
        session: updated,
        currentDurationMs: current,
        firedWarnings: [] as string[],
      };
    }

    // 1. Detect pending warnings.
    const fired = pendingWarnings(
      {
        status: open.status,
        lastResumedAt: open.lastResumedAt ?? null,
        accumulatedMs: open.accumulatedMs,
        warned4h: open.warned4h,
        warned8h: open.warned8h,
        warned10h: open.warned10h,
      },
      now,
    );

    let eventsJson = open.eventsJson ?? null;
    for (const w of fired) {
      eventsJson = appendEvent(eventsJson, {
        kind: w === "4h" ? "warning_4h" : w === "8h" ? "warning_8h" : "warning_10h",
        at: now.toISOString(),
      });
      await tx.auditLog.create({
        data: {
          action: "TIMER_WARNING",
          caseId: open.caseId,
          actorId: session.user.id,
          channel: "system",
          template: "timer-session",
          status: "ok",
          message: `Cronómetro alcanzó el umbral ${w}. Recordatorio enviado al abogado.`,
          metadata: JSON.stringify({ timerSessionId: open.id, threshold: w }),
        },
      });
    }

    // 2. Decide whether to auto-pause (12h cap) or hard-stop (16h cap).
    const current = computeCurrentDurationMs(
      { status: open.status, accumulatedMs: open.accumulatedMs, lastResumedAt: open.lastResumedAt ?? null },
      now,
    );
    let status: "ACTIVE" | "PENDING_CLOSE" = "ACTIVE";
    let autoPausedAt = open.autoPausedAt;
    let accumulatedMs = open.accumulatedMs;
    let lastResumedAt: Date | null = open.lastResumedAt ?? null;

    if (current >= TIMER_HARD_CAP_MS) {
      status = "PENDING_CLOSE";
      accumulatedMs = TIMER_HARD_CAP_MS; // we never count beyond the hard cap
      autoPausedAt = now;
      lastResumedAt = null;
      eventsJson = appendEvent(eventsJson, {
        kind: "auto_paused",
        at: now.toISOString(),
        detail: { reason: "hard_cap_16h", accumulatedMs },
      });
      await tx.auditLog.create({
        data: {
          action: "TIMER_AUTO_PAUSED",
          caseId: open.caseId,
          actorId: session.user.id,
          channel: "system",
          template: "timer-session",
          status: "flagged",
          message: "Cronómetro alcanzó el tope físico (16 h). Sesión pasa a PENDING_CLOSE.",
          metadata: JSON.stringify({ timerSessionId: open.id, accumulatedMs }),
        },
      });
    } else if (current >= TIMER_AUTO_CAP_MS) {
      status = "PENDING_CLOSE";
      accumulatedMs = current;
      autoPausedAt = now;
      lastResumedAt = null;
      eventsJson = appendEvent(eventsJson, {
        kind: "auto_paused",
        at: now.toISOString(),
        detail: { reason: "auto_cap_12h", accumulatedMs },
      });
      await tx.auditLog.create({
        data: {
          action: "TIMER_AUTO_PAUSED",
          caseId: open.caseId,
          actorId: session.user.id,
          channel: "system",
          template: "timer-session",
          status: "flagged",
          message: "Cronómetro superó las 12 h activas. Sesión pasa a PENDING_CLOSE.",
          metadata: JSON.stringify({ timerSessionId: open.id, accumulatedMs }),
        },
      });
    }

    const updated = await tx.timerSession.update({
      where: { id: open.id },
      data: {
        lastHeartbeatAt: now,
        status,
        accumulatedMs,
        lastResumedAt,
        autoPausedAt,
        eventsJson,
        ...(fired.includes("4h") ? { warned4h: true } : {}),
        ...(fired.includes("8h") ? { warned8h: true } : {}),
        ...(fired.includes("10h") ? { warned10h: true } : {}),
      },
    });

    return {
      kind: "ok" as const,
      session: updated,
      currentDurationMs: computeCurrentDurationMs(
        {
          status: updated.status,
          accumulatedMs: updated.accumulatedMs,
          lastResumedAt: updated.lastResumedAt ?? null,
        },
        now,
      ),
      firedWarnings: fired,
    };
  });

  if (result.kind === "no_session") {
    return NextResponse.json({ ok: true, session: null });
  }
  return NextResponse.json({
    ok: true,
    session: result.session,
    currentDurationMs: result.currentDurationMs,
    firedWarnings: result.firedWarnings,
  });
}
