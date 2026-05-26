import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { nombre, email, rol, activo, password } = body;

  const data: Record<string, unknown> = {};
  if (nombre !== undefined) data.nombre = nombre;
  if (email !== undefined) data.email = email;
  if (rol !== undefined) data.rol = rol;
  if (activo !== undefined) data.activo = activo;
  if (password) data.password_hash = await bcrypt.hash(password, 10);

  const usuario = await prisma.usuario.update({
    where: { id: Number(id) },
    data,
    select: { id: true, nombre: true, email: true, rol: true, activo: true },
  });
  return NextResponse.json(usuario);
}
