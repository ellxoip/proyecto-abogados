import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { CommentType, Role } from "@/lib/db-enums";

/**
 * POST /api/admin/mensajeria/read
 * Body: { caseId: string, type: "INTERNAL" | "PUBLIC" }
 *
 * Marca la conversación (caso × canal) como leída para el usuario actual.
 * Upsert sobre `conversation_reads` con `lastReadAt = now()`. Idempotente.
 * Se invoca cuando el thread queda visible en la UI (page o dock) para
 * que el badge de mensajería se descuente automáticamente.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  if (session.user.role === Role.CLIENTE) {
    return NextResponse.json({ ok: false, error: "Acceso restringido" }, { status: 403 });
  }

  let body: { caseId?: string; type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const caseId = (body.caseId ?? "").trim();
  const rawType = (body.type ?? "").toUpperCase();
  if (!caseId || (rawType !== "INTERNAL" && rawType !== "PUBLIC")) {
    return NextResponse.json({ ok: false, error: "Parámetros inválidos" }, { status: 400 });
  }
  const type = rawType as CommentType;

  await withRls(async (tx) => {
    // Scope-check: no permitir marcar leído un caso fuera del scope del staff.
    const caseScope =
      session.user.role === Role.SUPER_ADMIN
        ? {}
        : session.user.role === Role.JEFE_DE_MESA
        ? {
            OR: [
              { jefe_mesa_id: session.user.id },
              { abogados: { some: { managedById: session.user.id } } },
            ],
          }
        : { abogados: { some: { id: session.user.id } } };

    const kase = await tx.case.findFirst({ where: { id: caseId, ...caseScope }, select: { id: true } });
    if (!kase) return;

    await tx.conversationRead.upsert({
      where: { userId_caseId_type: { userId: session.user.id, caseId, type } },
      create: { userId: session.user.id, caseId, type, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    });
  });

  return NextResponse.json({ ok: true });
}
