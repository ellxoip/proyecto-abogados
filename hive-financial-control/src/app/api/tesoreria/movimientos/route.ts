import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkMutationRole } from "@/server/auth/roles";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const cuenta_id = sp.get("cuenta_id");
  const tipo = sp.get("tipo");
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");

  const movimientos = await prisma.movimientoTesoreria.findMany({
    where: {
      ...(cuenta_id ? { cuenta_id: Number(cuenta_id) } : {}),
      ...(tipo ? { tipo: tipo as "INGRESO" | "EGRESO" } : {}),
      ...(desde || hasta ? {
        fecha_movimiento: {
          ...(desde ? { gte: new Date(desde) } : {}),
          ...(hasta ? { lte: new Date(hasta + "T23:59:59") } : {}),
        },
      } : {}),
    },
    include: { cuenta: { include: { banco: true } } },
    orderBy: { fecha_movimiento: "desc" },
    take: 500,
  });
  return NextResponse.json(movimientos);
}

export async function POST(req: NextRequest) {
  const { error: authError } = await checkMutationRole();
  if (authError) return authError;

  const body = await req.json();
  const { cuenta_id, tipo, categoria, descripcion, monto, fecha_movimiento, referencia } = body;
  if (!cuenta_id || !tipo || !descripcion || !monto || !fecha_movimiento) {
    return NextResponse.json({ error: "Campos requeridos: cuenta_id, tipo, descripcion, monto, fecha_movimiento" }, { status: 400 });
  }

  const mov = await prisma.movimientoTesoreria.create({
    data: {
      cuenta_id: Number(cuenta_id),
      tipo,
      categoria,
      descripcion,
      monto: Number(monto),
      fecha_movimiento: new Date(fecha_movimiento),
      referencia,
    },
    include: { cuenta: { include: { banco: true } } },
  });
  return NextResponse.json(mov, { status: 201 });
}
