import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_TIPOS = ["FACTURA","BOLETA","NOTA_CREDITO_RECIBIDA","NOTA_DEBITO_RECIBIDA"];

export async function POST(req: NextRequest) {
  try {
    const { rows } = await req.json();
    if (!Array.isArray(rows)) return NextResponse.json({ error: "Invalid" }, { status: 400 });

    let importados = 0;
    let errores = 0;

    for (const row of rows) {
      try {
        const tipo = VALID_TIPOS.includes(row.tipo) ? row.tipo : "FACTURA";
        await prisma.documentoCompra.create({
          data: {
            proveedor_id: row.proveedor_id,
            tipo,
            numero: row.numero || null,
            fecha_emision: new Date(row.fecha_emision),
            monto_neto: row.monto_neto,
            iva: row.iva,
            monto_total: row.monto_total,
            estado: "RECIBIDO",
          },
        });
        importados++;
      } catch {
        errores++;
      }
    }

    return NextResponse.json({ importados, errores });
  } catch {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
