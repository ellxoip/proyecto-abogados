import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/server/auth/session";
import { EstadoCompromiso } from "@prisma/client";

const patchSchema = z.object({
  estado: z.nativeEnum(EstadoCompromiso).optional(),
  notas: z.string().max(500).optional().nullable(),
  fecha_compromiso: z.string().optional(),
  monto_comprometido: z.number().positive().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireSessionUser();
    const { id } = await params;
    const compromisoid = Number(id);
    if (!Number.isFinite(compromisoid) || compromisoid <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json();
    const data = patchSchema.parse(body);

    const compromiso = await prisma.compromisoPago.update({
      where: { id: compromisoid },
      data: {
        ...(data.estado !== undefined ? { estado: data.estado } : {}),
        ...(data.notas !== undefined ? { notas: data.notas } : {}),
        ...(data.fecha_compromiso ? { fecha_compromiso: new Date(data.fecha_compromiso) } : {}),
        ...(data.monto_comprometido !== undefined ? { monto_comprometido: data.monto_comprometido } : {}),
      },
    });

    return NextResponse.json({ ok: true, id: compromiso.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    await requireSessionUser();
    const { id } = await params;
    const compromisoid = Number(id);
    if (!Number.isFinite(compromisoid) || compromisoid <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }
    await prisma.compromisoPago.delete({ where: { id: compromisoid } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
