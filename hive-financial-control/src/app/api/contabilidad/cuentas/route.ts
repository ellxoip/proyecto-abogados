import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";

export async function GET() {
  const cuentas = await prisma.cuentaContable.findMany({
    include: { cuenta_padre: { select: { codigo: true, nombre: true } } },
    orderBy: { codigo: "asc" },
  });
  return NextResponse.json(cuentas);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { codigo, nombre, tipo, naturaleza, nivel, cuenta_padre_id, acepta_movimientos } = body;
  if (!codigo || !nombre || !tipo || !naturaleza) {
    return NextResponse.json({ error: "Campos requeridos: codigo, nombre, tipo, naturaleza" }, { status: 400 });
  }

  const cuenta = await prisma.cuentaContable.create({
    data: {
      codigo,
      nombre,
      tipo,
      naturaleza,
      nivel: nivel ?? 1,
      cuenta_padre_id: cuenta_padre_id ? Number(cuenta_padre_id) : null,
      acepta_movimientos: acepta_movimientos ?? true,
    },
  });
  return NextResponse.json(cuenta, { status: 201 });
}
