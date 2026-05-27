import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { rows } = await req.json();
    if (!Array.isArray(rows)) return NextResponse.json({ error: "Invalid" }, { status: 400 });

    let creados = 0;
    let errores = 0;

    for (const row of rows) {
      try {
        await prisma.proveedor.create({
          data: {
            rut: row.rut,
            nombre: row.nombre,
            giro: row.giro ?? null,
            email: row.email ?? null,
            telefono: row.telefono ?? null,
            banco: row.banco ?? null,
            numero_cuenta: row.numero_cuenta ?? null,
          },
        });
        creados++;
      } catch {
        errores++;
      }
    }

    return NextResponse.json({ creados, errores, duplicados: 0 });
  } catch {
    return NextResponse.json({ error: "Error importando" }, { status: 500 });
  }
}
