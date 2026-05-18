import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { Role } from "@/lib/db-enums";
// Auth bootstrap legitimately needs direct DB access: RLS depends on a
// session, but here we are establishing one. Allowlisted in .eslintrc.
import { _prisma } from "@/lib/db/_client";

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
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await _prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) {
          await new Promise((resolve) => setTimeout(resolve, 1500)); // Anti-enumeration delay
          return null;
        }

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          // Auditoría: Registrar Intento Fallido (ISO 27001 A.12.4.1)
          await _prisma.auditLog.create({
            data: {
              action: "LOGIN_FAILED",
              actorId: user.id,
              channel: "system",
              message: `Intento de acceso fallido para ${email}`,
              status: "failed",
            }
          });
          await new Promise((resolve) => setTimeout(resolve, 1500)); // Brute-force deterrence
          return null;
        }

        // Auditoría: Registrar Acceso Exitoso
        await _prisma.auditLog.create({
          data: {
            action: "LOGIN_SUCCESS",
            actorId: user.id,
            channel: "system",
            message: `Acceso exitoso al sistema. Rol: ${user.role}`,
            status: "ok",
          }
        });

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role: Role }).role;
      }
      return token;
    },
    session: ({ session, token }) => {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
});
