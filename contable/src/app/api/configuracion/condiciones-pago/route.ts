import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";

export async function GET() {
  const condiciones = await prisma.condicionPago.findMany({ orderBy: { dias_plazo: "asc" } });
  return NextResponse.json(condiciones);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { nombre, dias_plazo, descripcion } = body;
  if (!nombre || dias_plazo === undefined) {
    return NextResponse.json({ error: "Campos requeridos: nombre, dias_plazo" }, { status: 400 });
  }

  const condicion = await prisma.condicionPago.create({ data: { nombre, dias_plazo: Number(dias_plazo), descripcion } });
  return NextResponse.json(condicion, { status: 201 });
}
