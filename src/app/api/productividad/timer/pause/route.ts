import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { Role } from "@/lib/db-enums";
import { appendEvent, computeCurrentDurationMs } from "@/lib/productividad/timer-state";

/**
 * POST /api/productividad/timer/pause
 *
 * Pauses the lawyer's currently-active session. Accumulates the live span and
 * snapshots it into `accumulatedMs`. Idempotent: if the session is already
 * PAUSED, returns 200 without changing state.
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
      where: {
        lawyerId: session.user.id,
        status: { in: ["ACTIVE", "PAUSED"] },
      },
    });
    if (!open) {
      return { kind: "not_found" as const };
    }
    if (open.status === "PAUSED") {
      return { kind: "noop" as const, session: open };
    }
    const newAccumulated = computeCurrentDurationMs(
      { status: open.status, accumulatedMs: open.accumulatedMs, lastResumedAt: open.lastResumedAt ?? null },
      now,
    );
    const updated = await tx.timerSession.update({
      where: { id: open.id },
      data: {
        status: "PAUSED",
        accumulatedMs: newAccumulated,
        lastResumedAt: null,
        eventsJson: appendEvent(open.eventsJson, {
          kind: "paused",
          at: now.toISOString(),
          detail: { accumulatedMs: newAccumulated },
        }),
      },
    });
    await tx.auditLog.create({
      data: {
        action: "TIMER_PAUSED",
        caseId: open.caseId,
        actorId: session.user.id,
        channel: "system",
        template: "timer-session",
        status: "ok",
        message: "Sesión de cronómetro pausada.",
        metadata: JSON.stringify({
          timerSessionId: open.id,
          accumulatedMs: newAccumulated,
        }),
      },
    });
    return { kind: "ok" as const, session: updated };
  });

  if (result.kind === "not_found") {
    return NextResponse.json({ ok: false, error: "No hay sesión activa para pausar." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, session: result.session });
}
