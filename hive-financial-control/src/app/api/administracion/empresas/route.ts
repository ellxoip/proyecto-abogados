import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";

export async function GET() {
  const empresas = await prisma.empresa.findMany({ orderBy: { nombre: "asc" } });
  return NextResponse.json(empresas);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { nombre, rut, razon_social, giro, email, telefono } = body;
  if (!nombre || !rut || !razon_social) {
    return NextResponse.json({ error: "Campos requeridos: nombre, rut, razon_social" }, { status: 400 });
  }

  const empresa = await prisma.empresa.create({ data: { nombre, rut, razon_social, giro, email, telefono } });
  return NextResponse.json(empresa, { status: 201 });
}
