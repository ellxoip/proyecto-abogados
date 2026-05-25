import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { Role } from "@/lib/db-enums";

/**
 * GET /api/admin/mensajeria/cases
 *
 * Devuelve todos los casos en scope del usuario para iniciar una
 * conversación nueva (incluso si nunca se envió un mensaje en ese caso).
 *
 * Necesario porque `/summary` solo lista casos con mensajes recientes,
 * pero el dock debe permitir abrir un nuevo thread desde cero.
 *
 * Scope:
 *   - SUPER_ADMIN: todos los casos vivos
 *   - JEFE_DE_MESA: casos del grupo (jefe_mesa_id O abogado.managedById)
 *   - ABOGADO: casos donde está asignado
 *   - CLIENTE: bloqueado (usa /portal/casos)
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  if (session.user.role === Role.CLIENTE) {
    return NextResponse.json({ ok: false, error: "Acceso restringido." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10) || 100));

  const result = await withRls(async (tx) => {
    const scope =
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

    const where: Record<string, unknown> = { ...scope };
    if (q) {
      where.OR = [
        { code: { contains: q } },
        { client: { fullName: { contains: q } } },
      ];
    }

    const cases = await tx.case.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        code: true,
        stage: true,
        client: { select: { id: true, fullName: true } },
        categoria: { select: { name: true } },
        abogados: { select: { id: true, fullName: true } },
        _count: { select: { comments: true } },
      },
    });
    return cases;
  });

  return NextResponse.json({
    ok: true,
    total: result.length,
    cases: result.map((c) => ({
      id: c.id,
      code: c.code,
      stage: c.stage,
      clientName: c.client.fullName,
      clientId: c.client.id,
      categoria: c.categoria?.name ?? null,
      abogados: c.abogados,
      commentCount: c._count.comments,
    })),
  });
}
