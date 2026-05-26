import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { rows, cuenta_id } = await req.json();
    if (!Array.isArray(rows) || !cuenta_id) return NextResponse.json({ error: "Invalid" }, { status: 400 });

    let importados = 0;
    let errores = 0;

    for (const row of rows) {
      try {
        const tipo = row.abono ? "INGRESO" : "EGRESO";
        const monto = row.abono ?? row.cargo ?? 0;

        let fecha: Date;
        try {
          fecha = new Date(row.fecha);
          if (isNaN(fecha.getTime())) {
            const parts = row.fecha.split(/[\/\-\.]/);
            if (parts.length === 3) {
              fecha = parts[0].length === 4
                ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
                : new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
            } else throw new Error("invalid date");
          }
        } catch {
          errores++;
          continue;
        }

        await prisma.movimientoTesoreria.create({
          data: {
            cuenta_id,
            tipo,
            descripcion: row.glosa,
            monto,
            fecha_movimiento: fecha,
            conciliado: false,
          },
        });
        importados++;
      } catch {
        errores++;
      }
    }

    return NextResponse.json({ importados, errores });
  } catch {
    return NextResponse.json({ error: "Error importando" }, { status: 500 });
  }
}
