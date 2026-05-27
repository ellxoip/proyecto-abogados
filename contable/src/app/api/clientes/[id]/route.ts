import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/server/auth/session";
import { TipoCliente, EstadoCliente } from "@prisma/client";

const patchSchema = z.object({
  nombre: z.string().min(1).max(200).optional(),
  tipo_cliente: z.nativeEnum(TipoCliente).optional(),
  email: z.string().email().max(180).optional().nullable().or(z.literal("")),
  telefono: z.string().max(30).optional().nullable().or(z.literal("")),
  estado: z.nativeEnum(EstadoCliente).optional(),
  fecha_ingreso: z.string().min(1).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireSessionUser();
    const { id } = await params;
    const clienteId = Number(id);
    if (!Number.isFinite(clienteId) || clienteId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json();
    const data = patchSchema.parse(body);

    const cliente = await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        ...(data.nombre !== undefined && { nombre: data.nombre.trim() }),
        ...(data.tipo_cliente !== undefined && { tipo_cliente: data.tipo_cliente }),
        ...(data.email !== undefined && { email: data.email?.trim() || null }),
        ...(data.telefono !== undefined && { telefono: data.telefono?.trim() || null }),
        ...(data.estado !== undefined && { estado: data.estado }),
        ...(data.fecha_ingreso !== undefined && { fecha_ingreso: new Date(data.fecha_ingreso) }),
      },
    });

    return NextResponse.json({ ok: true, id: cliente.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    const msg = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireSessionUser();
    const { id } = await params;
    const clienteId = Number(id);
    if (!Number.isFinite(clienteId) || clienteId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }
    const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
    if (!cliente) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json(cliente);
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
