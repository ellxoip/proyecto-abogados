import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { Role } from "@/lib/db-enums";
import {
  ACTIVE_LIKE_STATUSES,
  TIMER_AUTO_CAP_MS,
  TIMER_HARD_CAP_MS,
  TIMER_WARN_4H_MS,
  TIMER_WARN_8H_MS,
  TIMER_WARN_10H_MS,
} from "@/lib/productividad/timer-policy";
import { computeCurrentDurationMs } from "@/lib/productividad/timer-state";

/**
 * GET /api/productividad/timer
 *
 * Returns the currently-open (ACTIVE / PAUSED / PENDING_CLOSE) timer session
 * for the authenticated lawyer, including a server-computed currentDurationMs.
 *
 * If none exists, returns `{ ok: true, session: null }`.
 */
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role === Role.CLIENTE) {
    return NextResponse.json({ ok: false, error: "Acceso restringido" }, { status: 403 });
  }

  const data = await withRls(async (tx) => {
    const open = await tx.timerSession.findFirst({
      where: {
        lawyerId: session.user.id,
        status: { in: ACTIVE_LIKE_STATUSES },
      },
      include: {
        case: { select: { id: true, code: true, stage: true, client: { select: { fullName: true } } } },
      },
      orderBy: { startedAt: "desc" },
    });
    return open;
  });

  if (!data) return NextResponse.json({ ok: true, session: null });

  const now = new Date();
  const currentDurationMs = computeCurrentDurationMs(
    {
      status: data.status,
      accumulatedMs: data.accumulatedMs,
      lastResumedAt: data.lastResumedAt ?? null,
    },
    now,
  );

  return NextResponse.json({
    ok: true,
    session: {
      id: data.id,
      status: data.status,
      caseId: data.caseId,
      caseCode: data.case.code,
      caseStage: data.case.stage,
      clientName: data.case.client.fullName,
      startedAt: data.startedAt.toISOString(),
      lastResumedAt: data.lastResumedAt?.toISOString() ?? null,
      lastHeartbeatAt: data.lastHeartbeatAt?.toISOString() ?? null,
      accumulatedMs: data.accumulatedMs,
      currentDurationMs,
      warned4h: data.warned4h,
      warned8h: data.warned8h,
      warned10h: data.warned10h,
      autoPausedAt: data.autoPausedAt?.toISOString() ?? null,
      thresholds: {
        warn4h: TIMER_WARN_4H_MS,
        warn8h: TIMER_WARN_8H_MS,
        warn10h: TIMER_WARN_10H_MS,
        autoCap: TIMER_AUTO_CAP_MS,
        hardCap: TIMER_HARD_CAP_MS,
      },
    },
  });
}
