import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";

export async function GET() {
  const categorias = await prisma.categoriaGasto.findMany({ orderBy: { nombre: "asc" } });
  return NextResponse.json(categorias);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { nombre, cuenta_contable } = body;
  if (!nombre) return NextResponse.json({ error: "nombre requerido" }, { status: 400 });

  const categoria = await prisma.categoriaGasto.create({ data: { nombre, cuenta_contable: cuenta_contable ?? null } });
  return NextResponse.json(categoria, { status: 201 });
}
