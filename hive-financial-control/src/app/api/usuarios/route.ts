import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";

export async function GET() {
  const usuarios = await prisma.usuario.findMany({
    select: { id: true, nombre: true, email: true, rol: true, activo: true, empresa_id: true, created_at: true },
    orderBy: { nombre: "asc" },
  });
  return NextResponse.json(usuarios);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { nombre, email, password, rol } = body;
  if (!nombre || !email || !password) {
    return NextResponse.json({ error: "Campos requeridos: nombre, email, password" }, { status: 400 });
  }

  const exists = await prisma.usuario.findUnique({ where: { email } });
  if (exists) return NextResponse.json({ error: "Email ya registrado" }, { status: 409 });

  const password_hash = await bcrypt.hash(password, 10);
  const usuario = await prisma.usuario.create({
    data: { nombre, email, password_hash, rol: rol ?? "CONTADOR" },
    select: { id: true, nombre: true, email: true, rol: true, activo: true },
  });
  return NextResponse.json(usuario, { status: 201 });
}
