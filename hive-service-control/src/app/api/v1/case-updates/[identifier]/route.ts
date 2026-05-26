import { NextRequest, NextResponse } from "next/server";
import { withSystemRls } from "@/lib/rls";
import { requireApiKey } from "@/lib/api-auth";

/**
 * GET /api/v1/case-updates/:identifier
 *
 * Retorna los casos y sus actualizaciones (timeline de avances) para un
 * cliente identificado por RUT. Diseñado para que PagaCuotas muestre
 * el progreso del expediente legal en el portal del cliente.
 *
 * Autenticación: Bearer <EXTERNAL_API_KEY>
 *
 * Respuesta:
 * {
 *   success: true,
 *   identifier: "12345678-9",
 *   cliente: { id, nombre, email },
 *   cases: [{
 *     id, code, stage, categoria, abogados,
 *     created_at, updated_at,
 *     total_updates: number,
 *     updates: [{ id, description, document_url, created_at }]
 *   }]
 * }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { identifier: string } }
) {
  const authError = requireApiKey(req);
  if (authError) return authError;

  try {
    const identifier = decodeURIComponent(params.identifier).trim();
    if (!identifier) {
      return NextResponse.json(
        { success: false, error: "Se requiere un identificador (RUT)." },
        { status: 400 }
      );
    }

    // Buscar el cliente por RUT
    const cliente = await withSystemRls(async (tx) => {
      return tx.user.findFirst({
        where: {
          role: "CLIENTE",
          rut: identifier,
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          rut: true,
        },
      });
    });

    if (!cliente) {
      return NextResponse.json(
        { success: false, error: "Cliente no encontrado con ese identificador." },
        { status: 404 }
      );
    }

    // Obtener los casos con sus actualizaciones
    const cases = await withSystemRls(async (tx) => {
      return tx.case.findMany({
        where: { client_id: cliente.id },
        select: {
          id: true,
          code: true,
          stage: true,
          createdAt: true,
          updatedAt: true,
          categoria: { select: { name: true } },
          abogados: { select: { id: true, fullName: true } },
          updates: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              description: true,
              document_url: true,
              createdAt: true,
            },
          },
          _count: { select: { updates: true } },
        },
        orderBy: { updatedAt: "desc" },
      });
    });

    const data = cases.map((caso) => ({
      id: caso.id,
      code: caso.code,
      stage: caso.stage,
      categoria: caso.categoria?.name ?? null,
      abogados: caso.abogados.map((a) => ({
        id: a.id,
        nombre: a.fullName,
      })),
      created_at: caso.createdAt.toISOString(),
      updated_at: caso.updatedAt.toISOString(),
      total_updates: caso._count.updates,
      updates: caso.updates.map((u) => ({
        id: u.id,
        description: u.description,
        document_url: u.document_url,
        created_at: u.createdAt.toISOString(),
      })),
    }));

    return NextResponse.json({
      success: true,
      identifier,
      cliente: {
        id: cliente.id,
        nombre: cliente.fullName,
        email: cliente.email,
      },
      cases: data,
    });
  } catch (err: any) {
    console.error("[API v1] GET /case-updates/:identifier error:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
