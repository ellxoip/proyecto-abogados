import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";

export async function GET() {
  const impuestos = await prisma.impuesto.findMany({ orderBy: { nombre: "asc" } });
  return NextResponse.json(impuestos);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { nombre, tasa, tipo } = body;
  if (!nombre || tasa === undefined || !tipo) {
    return NextResponse.json({ error: "Campos requeridos: nombre, tasa, tipo" }, { status: 400 });
  }

  const impuesto = await prisma.impuesto.create({ data: { nombre, tasa: Number(tasa), tipo } });
  return NextResponse.json(impuesto, { status: 201 });
}
