import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/server/auth/session";
import { TipoCliente } from "@prisma/client";

const createClienteSchema = z.object({
  rut: z.string().min(1).max(20),
  nombre: z.string().min(1).max(200),
  tipo_cliente: z.nativeEnum(TipoCliente),
  email: z.string().email().optional().nullable().or(z.literal("")),
  telefono: z.string().max(30).optional().nullable().or(z.literal("")),
  fecha_ingreso: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    await requireSessionUser();
    const body = await request.json();
    const data = createClienteSchema.parse(body);

    const cliente = await prisma.cliente.create({
      data: {
        rut: data.rut.trim(),
        nombre: data.nombre.trim(),
        tipo_cliente: data.tipo_cliente,
        email: data.email?.trim() || null,
        telefono: data.telefono?.trim() || null,
        fecha_ingreso: new Date(data.fecha_ingreso),
      },
    });

    return NextResponse.json({ ok: true, id: cliente.id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", details: error.issues }, { status: 400 });
    }
    const msg = error instanceof Error ? error.message : "Error interno";
    if (msg.includes("Unique constraint") || msg.includes("unique")) {
      return NextResponse.json({ error: "Ya existe un cliente con ese RUT" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
