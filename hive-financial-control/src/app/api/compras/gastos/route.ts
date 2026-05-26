import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const estado_pago = sp.get("estado_pago");
  const proveedor_id = sp.get("proveedor_id");
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");

  const where: Record<string, unknown> = {};
  if (estado_pago) where.estado_pago = estado_pago;
  if (proveedor_id) where.proveedor_id = Number(proveedor_id);
  if (desde || hasta) {
    where.fecha_gasto = {};
    if (desde) (where.fecha_gasto as Record<string, unknown>).gte = new Date(desde);
    if (hasta) (where.fecha_gasto as Record<string, unknown>).lte = new Date(hasta);
  }

  const gastos = await prisma.gastoCompra.findMany({
    where,
    include: { proveedor: { select: { id: true, nombre: true } } },
    orderBy: { fecha_gasto: "desc" },
    take: 500,
  });
  return NextResponse.json(gastos);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { categoria, descripcion, monto_neto, fecha_gasto, proveedor_id } = body;
  if (!categoria || !descripcion || monto_neto === undefined || !fecha_gasto) {
    return NextResponse.json({ error: "Campos requeridos: categoria, descripcion, monto_neto, fecha_gasto" }, { status: 400 });
  }

  const neto = Number(monto_neto);
  const iva = body.con_iva !== false ? Math.round(neto * 0.19) : 0;

  const gasto = await prisma.gastoCompra.create({
    data: {
      categoria,
      descripcion,
      monto_neto: neto,
      iva,
      monto_total: neto + iva,
      fecha_gasto: new Date(fecha_gasto),
      proveedor_id: proveedor_id ? Number(proveedor_id) : null,
    },
  });
  return NextResponse.json(gasto, { status: 201 });
}
