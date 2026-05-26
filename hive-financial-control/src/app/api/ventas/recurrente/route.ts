import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";

export async function GET() {
  const reglas = await prisma.reglaFacturacion.findMany({
    include: {
      cliente: { select: { id: true, nombre: true } },
      servicio: { select: { id: true, nombre: true, precio_ref: true } },
    },
    orderBy: { created_at: "desc" },
  });
  return NextResponse.json(
    reglas.map((r) => ({
      ...r,
      servicio: r.servicio
        ? {
            ...r.servicio,
            precio_base: r.servicio.precio_ref,
          }
        : null,
    })),
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { cliente_id, servicio_id, nombre, periodicidad, dia_emision, monto } = body;
  if (!cliente_id || !nombre || !periodicidad || !dia_emision || !monto) {
    return NextResponse.json({ error: "Campos requeridos: cliente_id, nombre, periodicidad, dia_emision, monto" }, { status: 400 });
  }

  const regla = await prisma.reglaFacturacion.create({
    data: {
      cliente_id: Number(cliente_id),
      servicio_id: servicio_id ? Number(servicio_id) : null,
      nombre,
      periodicidad,
      dia_emision: Number(dia_emision),
      monto: Number(monto),
    },
  });
  return NextResponse.json(regla, { status: 201 });
}
