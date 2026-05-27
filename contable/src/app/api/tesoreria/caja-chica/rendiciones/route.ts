import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";

export async function GET() {
  const rendiciones = await prisma.rendicionCajaChica.findMany({
    include: {
      fondo: { select: { id: true, nombre: true } },
      aprobador: { select: { nombre: true } },
      gastos: true,
      reposicion: true,
    },
    orderBy: { created_at: "desc" },
  });
  return NextResponse.json(rendiciones);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { fondo_id, periodo, gastos_ids } = body;
  if (!fondo_id || !periodo) {
    return NextResponse.json({ error: "Campos requeridos: fondo_id, periodo" }, { status: 400 });
  }

  const gastos = await prisma.gastoCajaChica.findMany({
    where: { id: { in: (gastos_ids ?? []).map(Number) }, fondo_id: Number(fondo_id), rendicion_id: null },
  });
  const total = gastos.reduce((s, g) => s + Number(g.monto), 0);

  const rendicion = await prisma.rendicionCajaChica.create({
    data: {
      fondo_id: Number(fondo_id),
      periodo,
      total_gastos: total,
      gastos: { connect: gastos.map((g) => ({ id: g.id })) },
    },
  });
  return NextResponse.json(rendicion, { status: 201 });
}
