import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";

export async function GET() {
  const fondos = await prisma.fondoCajaChica.findMany({
    include: { responsable: { select: { id: true, nombre: true } } },
    orderBy: { nombre: "asc" },
  });
  return NextResponse.json(fondos);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { nombre, monto_asignado, responsable_id, monto_max_gasto } = body;
  if (!nombre || !monto_asignado || !responsable_id) {
    return NextResponse.json({ error: "Campos requeridos: nombre, monto_asignado, responsable_id" }, { status: 400 });
  }

  const fondo = await prisma.fondoCajaChica.create({
    data: {
      nombre,
      monto_asignado: Number(monto_asignado),
      saldo_actual: Number(monto_asignado),
      responsable_id: Number(responsable_id),
      monto_max_gasto: Number(monto_max_gasto ?? monto_asignado),
    },
    include: { responsable: { select: { id: true, nombre: true } } },
  });
  return NextResponse.json(fondo, { status: 201 });
}
