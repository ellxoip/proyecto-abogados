import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { CommentType, Role } from "@/lib/db-enums";

/**
 * GET /api/admin/mensajeria/threads/:caseId
 *
 * Returns the full comment thread for a single case, segmented by channel
 * (INTERNAL = staff-only · PUBLIC = visible to the client too). RLS-aware:
 * lawyers and jefes can only access cases inside their scope. Clients are
 * blocked from this admin endpoint entirely.
 *
 * Query params:
 *  - type   "INTERNAL" | "PUBLIC"  (optional · default returns both grouped)
 *  - q      free text search inside body (optional)
 *  - limit  number of most-recent messages to return (default 200, max 500)
 */
export async function GET(req: Request, { params }: { params: { caseId: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  if (session.user.role === Role.CLIENTE) {
    return NextResponse.json({ ok: false, error: "Acceso restringido" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const rawType = (searchParams.get("type") ?? "").toUpperCase();
  const typeFilter: CommentType | undefined =
    rawType === "INTERNAL" || rawType === "PUBLIC" ? (rawType as CommentType) : undefined;
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "200", 10) || 200));

  const result = await withRls(async (tx) => {
    // Role-scoped case-existence check — prevents leaking data across teams.
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

    const kase = await tx.case.findFirst({
      where: { id: params.caseId, ...caseScope },
      select: {
        id: true,
        code: true,
        stage: true,
        client: { select: { id: true, fullName: true, email: true } },
        categoria: { select: { id: true, name: true } },
      },
    });
    if (!kase) return null;

    const comments = await tx.comment.findMany({
      where: {
        caseId: kase.id,
        ...(typeFilter ? { type: typeFilter } : {}),
        ...(q ? { body: { contains: q } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: {
        id: true,
        body: true,
        type: true,
        createdAt: true,
        authorId: true,
        author: { select: { id: true, fullName: true, role: true } },
      },
    });

    return { kase, comments };
  });

  if (!result) {
    return NextResponse.json({ ok: false, error: "Caso no encontrado o fuera de tu alcance." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    case: {
      id: result.kase.id,
      code: result.kase.code,
      stage: result.kase.stage,
      client: result.kase.client,
      categoria: result.kase.categoria,
    },
    messages: result.comments.map((c) => ({
      id: c.id,
      body: c.body,
      type: c.type,
      createdAt: c.createdAt.toISOString(),
      authorId: c.authorId,
      author: c.author,
      isMine: c.authorId === session.user.id,
    })),
  });
}
