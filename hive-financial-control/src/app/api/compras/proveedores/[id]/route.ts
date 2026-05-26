import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proveedor = await prisma.proveedor.findUnique({
    where: { id: Number(id) },
    include: {
      gastos: { orderBy: { fecha_gasto: "desc" }, take: 20 },
      documentos: { orderBy: { fecha_emision: "desc" }, take: 20 },
      honorarios: { orderBy: { fecha_emision: "desc" }, take: 10 },
      cuentas_por_pagar: { where: { estado: { in: ["PENDIENTE", "VENCIDA"] } }, orderBy: { fecha_vencimiento: "asc" } },
    },
  });
  if (!proveedor) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(proveedor);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const proveedor = await prisma.proveedor.update({ where: { id: Number(id) }, data: body });
  return NextResponse.json(proveedor);
}
