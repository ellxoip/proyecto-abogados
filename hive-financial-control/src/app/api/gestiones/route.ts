import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/server/auth/session";
import { TipoGestion, ResultadoGestion, Prisma } from "@prisma/client";

const postSchema = z.object({
  cliente_id: z.number().int().positive(),
  contrato_id: z.number().int().positive(),
  tipo: z.nativeEnum(TipoGestion),
  resultado: z.nativeEnum(ResultadoGestion),
  notas: z.string().max(1000).optional().nullable(),
  fecha_gestion: z.string().min(1),
  seguimiento_fecha: z.string().optional().nullable(),
});

function pick(v: string | null) {
  return v ?? undefined;
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const clienteId = pick(searchParams.get("cliente_id"));
    const contratoId = pick(searchParams.get("contrato_id"));

    const where: Prisma.GestionCobranzaWhereInput = {
      ...(clienteId ? { cliente_id: Number(clienteId) } : {}),
      ...(contratoId ? { contrato_id: Number(contratoId) } : {}),
    };

    const gestiones = await prisma.gestionCobranza.findMany({
      where,
      include: {
        cliente: { select: { id: true, nombre: true, rut: true } },
        contrato: { select: { id: true, tipo_servicio: true } },
        usuario: { select: { id: true, nombre: true } },
      },
      orderBy: { fecha_gestion: "desc" },
      take: 200,
    });

    void user;
    return NextResponse.json(gestiones);
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const data = postSchema.parse(body);

    const gestion = await prisma.gestionCobranza.create({
      data: {
        cliente_id: data.cliente_id,
        contrato_id: data.contrato_id,
        tipo: data.tipo,
        resultado: data.resultado,
        notas: data.notas?.trim() || null,
        fecha_gestion: new Date(data.fecha_gestion),
        seguimiento_fecha: data.seguimiento_fecha ? new Date(data.seguimiento_fecha) : null,
        usuario_id: user.id,
      },
    });

    return NextResponse.json({ ok: true, id: gestion.id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
