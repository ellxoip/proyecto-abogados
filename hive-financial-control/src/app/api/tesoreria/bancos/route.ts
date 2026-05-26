import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";

export async function GET() {
  const bancos = await prisma.banco.findMany({
    where: { activo: true },
    include: { cuentas: { where: { activa: true } } },
    orderBy: { nombre: "asc" },
  });
  return NextResponse.json(bancos);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { nombre, codigo_banco } = body;
  if (!nombre) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });

  const banco = await prisma.banco.create({ data: { nombre, codigo_banco } });
  return NextResponse.json(banco, { status: 201 });
}
