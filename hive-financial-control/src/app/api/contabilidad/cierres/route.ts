import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";

export async function GET() {
  const cierres = await prisma.cierreContable.findMany({
    include: { usuario: { select: { nombre: true } } },
    orderBy: [{ periodo: "desc" }, { tipo: "asc" }],
  });
  return NextResponse.json(cierres);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { tipo, periodo, fecha_cierre, observaciones } = body;
  if (!tipo || !periodo || !fecha_cierre) {
    return NextResponse.json({ error: "Campos requeridos: tipo, periodo, fecha_cierre" }, { status: 400 });
  }

  const cierre = await prisma.cierreContable.create({
    data: {
      tipo,
      periodo,
      fecha_cierre: new Date(fecha_cierre),
      usuario_id: Number(session.userId),
      observaciones: observaciones ?? null,
    },
  });
  return NextResponse.json(cierre, { status: 201 });
}
