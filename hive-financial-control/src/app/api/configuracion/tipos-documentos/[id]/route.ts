import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const tipo = await prisma.tipoDocumentoTributario.update({
      where: { id: Number(id) },
      data: {
        nombre: body.nombre,
        codigo: body.codigo,
        folio_inicial: body.folio_inicial,
        siguiente_folio: body.siguiente_folio,
        cuenta_contable: body.cuenta_contable,
        activo: body.activo,
      },
    });
    return NextResponse.json(tipo);
  } catch {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
