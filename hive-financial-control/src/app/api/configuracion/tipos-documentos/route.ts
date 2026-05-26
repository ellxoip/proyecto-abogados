import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const tipos = await prisma.tipoDocumentoTributario.findMany({ orderBy: { codigo: "asc" } });
  return NextResponse.json(tipos);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tipo = await prisma.tipoDocumentoTributario.create({
      data: {
        nombre: body.nombre,
        codigo: body.codigo,
        folio_inicial: body.folio_inicial ?? 1,
        siguiente_folio: body.folio_inicial ?? 1,
        cuenta_contable: body.cuenta_contable ?? null,
        activo: true,
      },
    });
    return NextResponse.json(tipo, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
