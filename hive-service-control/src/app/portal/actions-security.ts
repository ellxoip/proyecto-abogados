"use server";

import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

/**
 * Verifies the secondary PIN/Code for delicate cases.
 * Sets a secure cookie upon success to prevent repeated challenges in the same session.
 */
export async function verifySecondaryIdentity(caseId: string, code: string) {
  const session = await auth();
  if (!session) return { ok: false, reason: "No autenticado" };

  const userId = session.user.id;

  const result = await withRls(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { secondary_code: true }
    });

    if (!user || user.secondary_code !== code) {
      return { ok: false, reason: "Código de verificación incorrecto." };
    }

    return { ok: true };
  });

  if (result.ok) {
    // Set a verification token in cookies for this specific case
    // In a production app, this should be a signed JWT or similar.
    cookies().set(`verified_case_${caseId}`, "true", { 
      maxAge: 60 * 60, // 1 hour 
      httpOnly: true,
      secure: process.env.NODE_ENV === "production"
    });
  }

  return result;
}

export async function isCaseVerified(caseId: string) {
  return cookies().get(`verified_case_${caseId}`)?.value === "true";
}

/**
 * Verifies the client's login password before allowing document download.
 * Sets a short-lived cookie on success so repeated downloads in the same session skip the prompt.
 */
export async function verifyDownloadAccess(caseId: string, password: string) {
  const session = await auth();
  if (!session) return { ok: false, reason: "No autenticado" };

  const result = await withRls(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true },
    });
    if (!user) return { ok: false, reason: "Usuario no encontrado" };
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return { ok: false, reason: "Contraseña incorrecta. Ingresa las credenciales de tu cuenta." };
    return { ok: true };
  });

  if (result.ok) {
    cookies().set(`dl_access_${caseId}`, "1", {
      maxAge: 60 * 30, // 30 min
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
  }

  return result;
}

export async function hasDownloadAccess(caseId: string) {
  return cookies().get(`dl_access_${caseId}`)?.value === "1";
}
