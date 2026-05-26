import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

export async function requireSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    throw new Error("No autorizado.");
  }

  const payload = await verifySession(token);
  const userId = Number(payload.sub);

  if (!Number.isFinite(userId)) {
    throw new Error("Sesion invalida.");
  }

  return {
    id: userId,
    email: payload.email,
    rol: payload.rol,
  };
}
