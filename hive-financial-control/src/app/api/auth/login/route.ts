import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { signSession, SESSION_COOKIE, EXPIRATION_SECONDS } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = loginSchema.parse(body);

    const user = await prisma.usuario.findUnique({
      where: { email: parsed.email },
    });

    if (!user || !user.activo) {
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }

    const ok = await bcrypt.compare(parsed.password, user.password_hash);
    if (!ok) {
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }

    const token = await signSession({
      sub: String(user.id),
      email: user.email,
      rol: user.rol,
    });

    const response = NextResponse.json({
      ok: true,
      user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol },
    });

    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: EXPIRATION_SECONDS,
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
}
