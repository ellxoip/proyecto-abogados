import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const tipo = await prisma.tipoMovimientoConfig.update({
      where: { id: Number(id) },
      data: {
        nombre: body.nombre,
        naturaleza: body.naturaleza,
        cuenta_contable: body.cuenta_contable,
        recurrente: body.recurrente,
        activo: body.activo,
      },
    });
    return NextResponse.json(tipo);
  } catch {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
