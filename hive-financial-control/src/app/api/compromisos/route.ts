import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/server/auth/session";
import { Prisma } from "@prisma/client";

const postSchema = z.object({
  cliente_id: z.number().int().positive(),
  contrato_id: z.number().int().positive(),
  cuota_id: z.number().int().positive().optional().nullable(),
  fecha_compromiso: z.string().min(1),
  monto_comprometido: z.number().positive(),
  notas: z.string().max(500).optional().nullable(),
});

function pick(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const estado = pick(searchParams.get("estado") ?? undefined);
    const clienteId = pick(searchParams.get("cliente_id") ?? undefined);

    const where: Prisma.CompromisoPagoWhereInput = {
      ...(estado ? { estado: estado as never } : {}),
      ...(clienteId ? { cliente_id: Number(clienteId) } : {}),
    };

    const compromisos = await prisma.compromisoPago.findMany({
      where,
      include: {
        cliente: { select: { id: true, nombre: true, rut: true } },
        contrato: { select: { id: true, tipo_servicio: true } },
        cuota: { select: { id: true, numero_cuota: true } },
        usuario: { select: { id: true, nombre: true } },
      },
      orderBy: { fecha_compromiso: "asc" },
      take: 200,
    });

    void user;
    return NextResponse.json(compromisos);
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const data = postSchema.parse(body);

    const compromiso = await prisma.compromisoPago.create({
      data: {
        cliente_id: data.cliente_id,
        contrato_id: data.contrato_id,
        cuota_id: data.cuota_id ?? null,
        fecha_compromiso: new Date(data.fecha_compromiso),
        monto_comprometido: data.monto_comprometido,
        notas: data.notas?.trim() || null,
        usuario_id: user.id,
      },
    });

    return NextResponse.json({ ok: true, id: compromiso.id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
