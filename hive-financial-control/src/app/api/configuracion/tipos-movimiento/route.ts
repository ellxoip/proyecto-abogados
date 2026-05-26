import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const tipos = await prisma.tipoMovimientoConfig.findMany({ orderBy: { nombre: "asc" } });
  return NextResponse.json(tipos);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tipo = await prisma.tipoMovimientoConfig.create({
      data: {
        nombre: body.nombre,
        naturaleza: body.naturaleza,
        cuenta_contable: body.cuenta_contable ?? null,
        recurrente: body.recurrente ?? false,
        activo: true,
      },
    });
    return NextResponse.json(tipo, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
