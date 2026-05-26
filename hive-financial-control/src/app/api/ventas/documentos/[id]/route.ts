import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const documento = await prisma.documentoVenta.findUnique({
    where: { id: Number(id) },
    include: {
      cliente: { select: { id: true, nombre: true, rut: true } },
      lineas: true,
      notas_credito: true,
    },
  });
  if (!documento) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(documento);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const { estado, observaciones } = body;
  const documento = await prisma.documentoVenta.update({
    where: { id: Number(id) },
    data: { ...(estado && { estado }), ...(observaciones !== undefined && { observaciones }) },
  });
  return NextResponse.json(documento);
}
