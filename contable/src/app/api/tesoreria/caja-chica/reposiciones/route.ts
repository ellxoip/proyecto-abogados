import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";

export async function GET() {
  const reposiciones = await prisma.reposicionCajaChica.findMany({
    include: {
      rendicion: { include: { fondo: { select: { nombre: true } } } },
      aprobador: { select: { nombre: true } },
    },
    orderBy: { created_at: "desc" },
  });
  return NextResponse.json(reposiciones);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { rendicion_id } = body;
  if (!rendicion_id) return NextResponse.json({ error: "rendicion_id requerido" }, { status: 400 });

  const rendicion = await prisma.rendicionCajaChica.findUnique({
    where: { id: Number(rendicion_id) },
  });
  if (!rendicion) return NextResponse.json({ error: "Rendición no encontrada" }, { status: 404 });
  if (rendicion.estado !== "APROBADA") {
    return NextResponse.json({ error: "Solo se pueden reponer rendiciones aprobadas" }, { status: 400 });
  }

  const reposicion = await prisma.reposicionCajaChica.create({
    data: { rendicion_id: Number(rendicion_id), monto: rendicion.total_gastos },
  });
  return NextResponse.json(reposicion, { status: 201 });
}
