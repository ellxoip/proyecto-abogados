import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_TIPOS = ["BOLETA","FACTURA_EXENTA","FACTURA_AFECTA","NOTA_CREDITO","NOTA_DEBITO","COMPROBANTE_INGRESO"];

export async function POST(req: NextRequest) {
  try {
    const { rows } = await req.json();
    if (!Array.isArray(rows)) return NextResponse.json({ error: "Invalid" }, { status: 400 });

    let importados = 0;
    let errores = 0;

    for (const row of rows) {
      try {
        const tipo = VALID_TIPOS.includes(row.tipo) ? row.tipo : "BOLETA";
        await prisma.documentoVenta.create({
          data: {
            tipo,
            numero: row.numero ? parseInt(row.numero) || null : null,
            razon_social: row.razon_social,
            rut_receptor: row.rut_receptor || null,
            fecha_emision: new Date(row.fecha_emision),
            monto_neto: row.monto_neto,
            iva: row.iva,
            monto_total: row.monto_total,
            estado: "EMITIDO",
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
