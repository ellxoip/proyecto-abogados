import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { Role } from "@/lib/db-enums";
// Auth bootstrap legitimately needs direct DB access: RLS depends on a
// session, but here we are establishing one. Allowlisted in .eslintrc.
import { _prisma } from "@/lib/db/_client";

const ANTI_ENUMERATION_DELAY_MS = 1500;

type VerifiedUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
};

/**
 * Núcleo del flujo de autenticación por credenciales. Devuelve el usuario
 * autenticado o `null` si falla, escribe el audit log correspondiente y
 * aplica el delay anti-enumeración cuando el lookup falla.
 *
 * Extraído como función pura para poder testearlo sin levantar NextAuth.
 */
export async function verifyCredentials(
  rawEmail: unknown,
  rawPassword: unknown,
  opts: { skipDelay?: boolean } = {},
): Promise<VerifiedUser | null> {
  const email = String(rawEmail ?? "").trim().toLowerCase();
  const password = String(rawPassword ?? "");
  if (!email || !password) return null;

  const user = await _prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    if (!opts.skipDelay) {
      await new Promise((resolve) => setTimeout(resolve, ANTI_ENUMERATION_DELAY_MS));
    }
    return null;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    await _prisma.auditLog.create({
      data: {
        action: "LOGIN_FAILED",
        actorId: user.id,
        channel: "system",
        message: `Intento de acceso fallido para ${email}`,
        status: "failed",
      },
    });
    if (!opts.skipDelay) {
      await new Promise((resolve) => setTimeout(resolve, ANTI_ENUMERATION_DELAY_MS));
    }
    return null;
  }

  await _prisma.auditLog.create({
    data: {
      action: "LOGIN_SUCCESS",
      actorId: user.id,
      channel: "system",
      message: `Acceso exitoso al sistema. Rol: ${user.role}`,
      status: "ok",
    },
  });

  return {
    id: user.id,
    email: user.email,
    name: user.fullName,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: "jwt",
    maxAge: 4 * 60 * 60, // 4 hours maximum session (ISO 27001 A.9.2.5 - Timeout and Review of Access)
  },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      authorize: async (credentials) => {
        return verifyCredentials(credentials?.email, credentials?.password);
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user, trigger, session }) => {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role: Role }).role;
        token.mustChangePassword = (user as { mustChangePassword: boolean }).mustChangePassword;
      }
      // Permite refrescar el flag tras un session.update() (lo dispara la
      // página de cambio de password cuando el cliente rota su clave).
      if (trigger === "update" && session && typeof session === "object" && "mustChangePassword" in session) {
        token.mustChangePassword = Boolean((session as { mustChangePassword: unknown }).mustChangePassword);
      }
      return token;
    },
    session: ({ session, token }) => {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
      }
      return session;
    },
  },
});
