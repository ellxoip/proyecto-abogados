import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";

export async function GET() {
  const tipos = await prisma.tipoComprobanteContable.findMany({
    orderBy: { nombre: "asc" },
    include: { _count: { select: { comprobantes: true } } },
  });
  return NextResponse.json(tipos);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { nombre, descripcion, prefijo } = body;
  if (!nombre) return NextResponse.json({ error: "nombre requerido" }, { status: 400 });

  const tipo = await prisma.tipoComprobanteContable.create({
    data: { nombre, descripcion: descripcion ?? null, prefijo: prefijo ?? null },
  });
  return NextResponse.json(tipo, { status: 201 });
}
