import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";

export async function GET() {
  const proveedores = await prisma.proveedor.findMany({
    orderBy: { nombre: "asc" },
    include: { _count: { select: { gastos: true, documentos: true } } },
  });
  return NextResponse.json(proveedores);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { rut, nombre, razon_social, giro, direccion, telefono, email, banco, numero_cuenta, tipo_cuenta_pago, categoria } = body;
  if (!rut || !nombre) {
    return NextResponse.json({ error: "Campos requeridos: rut, nombre" }, { status: 400 });
  }

  const proveedor = await prisma.proveedor.create({
    data: { rut, nombre, razon_social, giro, direccion, telefono, email, banco, numero_cuenta, tipo_cuenta_pago, categoria },
  });
  return NextResponse.json(proveedor, { status: 201 });
}
