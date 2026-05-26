import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const estado = sp.get("estado");
  const proveedor_id = sp.get("proveedor_id");

  const where: Record<string, unknown> = {};
  if (estado) where.estado = estado;
  if (proveedor_id) where.proveedor_id = Number(proveedor_id);

  const cxp = await prisma.cuentaPorPagar.findMany({
    where,
    include: {
      proveedor: { select: { id: true, nombre: true, rut: true } },
      documento: { select: { id: true, tipo: true, numero: true } },
    },
    orderBy: { fecha_vencimiento: "asc" },
  });
  return NextResponse.json(cxp);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { proveedor_id, monto, fecha_vencimiento, documento_id } = body;
  if (!proveedor_id || !monto || !fecha_vencimiento) {
    return NextResponse.json({ error: "Campos requeridos: proveedor_id, monto, fecha_vencimiento" }, { status: 400 });
  }

  const cxp = await prisma.cuentaPorPagar.create({
    data: {
      proveedor_id: Number(proveedor_id),
      monto: Number(monto),
      fecha_vencimiento: new Date(fecha_vencimiento),
      documento_id: documento_id ? Number(documento_id) : null,
    },
  });
  return NextResponse.json(cxp, { status: 201 });
}
