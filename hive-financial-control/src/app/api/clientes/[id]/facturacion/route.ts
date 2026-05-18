import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/server/auth/session";

const schema = z.object({
  rut_facturacion: z.string().min(1).max(20),
  razon_social_facturacion: z.string().min(1).max(200),
  giro_facturacion: z.string().max(200).optional().nullable().or(z.literal("")),
  direccion_facturacion: z.string().max(255).optional().nullable().or(z.literal("")),
  comuna: z.string().max(120).optional().nullable().or(z.literal("")),
  ciudad: z.string().max(120).optional().nullable().or(z.literal("")),
  email_facturacion: z.string().email().max(180).optional().nullable().or(z.literal("")),
  tipo_documento_preferido: z.string().max(80).optional().nullable().or(z.literal("")),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireSessionUser();
    const { id } = await params;
    const clienteId = Number(id);
    const datos = await prisma.clienteFacturacion.findFirst({ where: { cliente_id: clienteId } });
    return NextResponse.json(datos ?? null);
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
    const data = schema.parse(body);

    const datos = await prisma.clienteFacturacion.upsert({
      where: { cliente_id_rut_facturacion: { cliente_id: clienteId, rut_facturacion: data.rut_facturacion } },
      create: {
        cliente_id: clienteId,
        rut_facturacion: data.rut_facturacion.trim(),
        razon_social_facturacion: data.razon_social_facturacion.trim(),
        giro_facturacion: data.giro_facturacion?.trim() || null,
        direccion_facturacion: data.direccion_facturacion?.trim() || null,
        comuna: data.comuna?.trim() || null,
        ciudad: data.ciudad?.trim() || null,
        email_facturacion: data.email_facturacion?.trim() || null,
        tipo_documento_preferido: data.tipo_documento_preferido?.trim() || null,
      },
      update: {
        razon_social_facturacion: data.razon_social_facturacion.trim(),
        giro_facturacion: data.giro_facturacion?.trim() || null,
        direccion_facturacion: data.direccion_facturacion?.trim() || null,
        comuna: data.comuna?.trim() || null,
        ciudad: data.ciudad?.trim() || null,
        email_facturacion: data.email_facturacion?.trim() || null,
        tipo_documento_preferido: data.tipo_documento_preferido?.trim() || null,
      },
    });

    return NextResponse.json({ ok: true, id: datos.id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
