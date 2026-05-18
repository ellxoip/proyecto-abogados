import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { Role } from "@/lib/db-enums";
import { ACTIVE_LIKE_STATUSES } from "@/lib/productividad/timer-policy";
import { appendEvent } from "@/lib/productividad/timer-state";
import { z } from "zod";

const Body = z.object({ caseId: z.string().uuid() });

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * POST /api/productividad/timer/start
 *
 * Starts a timer session for the authenticated lawyer on a case they are
 * assigned to. Enforces:
 *  - Only one ACTIVE/PAUSED/PENDING_CLOSE session per lawyer at a time.
 *  - The case must be visible under the lawyer's case scope.
 *  - AuditLog row in the same transaction.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role === Role.CLIENTE) {
    return NextResponse.json({ ok: false, error: "Acceso restringido" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Datos inválidos" }, { status: 400 });
  }
  const { caseId } = parsed.data;

  const ip = clientIp(req);
  const userAgent = req.headers.get("user-agent")?.slice(0, 200) ?? null;
  const now = new Date();

  const result = await withRls(async (tx) => {
    // 1. Refuse if there is already an open session for this lawyer.
    const existing = await tx.timerSession.findFirst({
      where: {
        lawyerId: session.user.id,
        status: { in: ACTIVE_LIKE_STATUSES },
      },
      include: { case: { select: { code: true } } },
    });
    if (existing) {
      return {
        kind: "conflict" as const,
        status: 409,
        body: {
          ok: false,
          code: "ALREADY_OPEN",
          error: `Ya tienes una sesión ${existing.status} en el caso ${existing.case.code}. Ciérrala o pausa antes de iniciar otra.`,
          openSessionId: existing.id,
        },
      };
    }

    // 2. Verify the case exists and is in scope. ABOGADO must be assigned.
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
      return { kind: "error" as const, status: 404, body: { ok: false, error: "Caso no encontrado." } };
    }
    const isAssigned = kase.abogados.some((a) => a.id === session.user.id);
    const isPrivileged =
      session.user.role === Role.SUPER_ADMIN || session.user.role === Role.JEFE_DE_MESA;
    if (!isAssigned && !isPrivileged) {
      return {
        kind: "error" as const,
        status: 403,
        body: { ok: false, error: "No estás asignado a este expediente." },
      };
    }

    // 3. Create the session in a single transaction; the AuditLog goes along.
    const eventsJson = appendEvent(null, {
      kind: "started",
      at: now.toISOString(),
      detail: { ip, userAgent, caseStage: kase.stage },
    });

    const created = await tx.timerSession.create({
      data: {
        lawyerId: session.user.id,
        caseId,
        status: "ACTIVE",
        startedAt: now,
        lastResumedAt: now,
        lastHeartbeatAt: now,
        accumulatedMs: 0,
        startIp: ip,
        startUserAgent: userAgent,
        eventsJson,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "TIMER_STARTED",
        caseId,
        actorId: session.user.id,
        channel: "system",
        template: "timer-session",
        status: "ok",
        message: `Sesión de cronómetro iniciada por ${session.user.name ?? session.user.id} sobre ${kase.code}.`,
        metadata: JSON.stringify({
          timerSessionId: created.id,
          caseCode: kase.code,
          caseStage: kase.stage,
          ip,
          userAgent,
        }),
      },
    });

    return { kind: "ok" as const, body: { ok: true, sessionId: created.id, status: created.status } };
  });

  if (result.kind !== "ok") {
    return NextResponse.json(result.body, { status: result.status });
  }
  return NextResponse.json(result.body, { status: 201 });
}
