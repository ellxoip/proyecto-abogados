import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/server/auth/session";

const postSchema = z.object({
  nombre: z.string().min(1).max(200),
  email: z.string().email().max(180).optional().nullable().or(z.literal("")),
  telefono: z.string().max(30).optional().nullable().or(z.literal("")),
  cargo: z.string().max(120).optional().nullable().or(z.literal("")),
  es_principal: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireSessionUser();
    const { id } = await params;
    const clienteId = Number(id);
    const contactos = await prisma.clienteContacto.findMany({
      where: { cliente_id: clienteId },
      orderBy: [{ es_principal: "desc" }, { nombre: "asc" }],
    });
    return NextResponse.json(contactos);
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    await requireSessionUser();
    const { id } = await params;
    const clienteId = Number(id);
    if (!Number.isFinite(clienteId) || clienteId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json();
    const data = postSchema.parse(body);

    const contacto = await prisma.clienteContacto.create({
      data: {
        cliente_id: clienteId,
        nombre: data.nombre.trim(),
        email: data.email?.trim() || null,
        telefono: data.telefono?.trim() || null,
        cargo: data.cargo?.trim() || null,
        es_principal: data.es_principal ?? false,
      },
    });

    return NextResponse.json({ ok: true, id: contacto.id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
