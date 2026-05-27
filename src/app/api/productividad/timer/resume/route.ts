import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { Role } from "@/lib/db-enums";
import { TIMER_HARD_CAP_MS } from "@/lib/productividad/timer-policy";
import { appendEvent } from "@/lib/productividad/timer-state";

/**
 * POST /api/productividad/timer/resume
 *
 * Reanuda una sesión PAUSED. Bloquea si la duración ya acumulada supera el
 * hard cap (16 h) — en ese caso la sesión queda PENDING_CLOSE y se debe cerrar
 * (registrar TimeEntry parcial o descartar) manualmente.
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
      where: { lawyerId: session.user.id, status: { in: ["PAUSED", "ACTIVE"] } },
    });
    if (!open) return { kind: "not_found" as const };
    if (open.status === "ACTIVE") return { kind: "noop" as const, session: open };

    if (open.accumulatedMs >= TIMER_HARD_CAP_MS) {
      const escalated = await tx.timerSession.update({
        where: { id: open.id },
        data: {
          status: "PENDING_CLOSE",
          eventsJson: appendEvent(open.eventsJson, {
            kind: "auto_paused",
            at: now.toISOString(),
            detail: { reason: "hard_cap_reached_before_resume" },
          }),
        },
      });
      await tx.auditLog.create({
        data: {
          action: "TIMER_PENDING_CLOSE",
          caseId: open.caseId,
          actorId: session.user.id,
          channel: "system",
          template: "timer-session",
          status: "flagged",
          message: "La sesión supera el tope físico; requiere cierre o descarte.",
          metadata: JSON.stringify({ timerSessionId: open.id, accumulatedMs: open.accumulatedMs }),
        },
      });
      return { kind: "blocked" as const, session: escalated };
    }

    const updated = await tx.timerSession.update({
      where: { id: open.id },
      data: {
        status: "ACTIVE",
        lastResumedAt: now,
        lastHeartbeatAt: now,
        eventsJson: appendEvent(open.eventsJson, { kind: "resumed", at: now.toISOString() }),
      },
    });
    await tx.auditLog.create({
      data: {
        action: "TIMER_RESUMED",
        caseId: open.caseId,
        actorId: session.user.id,
        channel: "system",
        template: "timer-session",
        status: "ok",
        message: "Sesión de cronómetro reanudada.",
        metadata: JSON.stringify({ timerSessionId: open.id, accumulatedMs: open.accumulatedMs }),
      },
    });
    return { kind: "ok" as const, session: updated };
  });

  if (result.kind === "not_found") {
    return NextResponse.json({ ok: false, error: "No hay sesión pausada para reanudar." }, { status: 404 });
  }
  if (result.kind === "blocked") {
    return NextResponse.json(
      {
        ok: false,
        code: "HARD_CAP_REACHED",
        error: "Esta sesión ya supera el tope físico (16 h). Debes cerrarla con justificación o descartarla.",
        session: result.session,
      },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, session: result.session });
}
