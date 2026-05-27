"use server";

import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { withSystemRls } from "@/lib/rls";
import { logAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/services/credentials";
import { syncClientPasswordToFinancial } from "@/lib/services/financial-password-sync";

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: string };

const MIN_LENGTH = 8;
const STRENGTH_MSG = "La nueva contraseña debe tener al menos 8 caracteres, una letra y un número.";

function isStrongEnough(pwd: string): boolean {
  if (pwd.length < MIN_LENGTH) return false;
  if (!/[A-Za-z]/.test(pwd)) return false;
  if (!/\d/.test(pwd)) return false;
  return true;
}

export async function changeOwnPassword(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<ChangePasswordResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sesión expirada." };

  const current = String(input.currentPassword ?? "");
  const next = String(input.newPassword ?? "");
  const confirm = String(input.confirmPassword ?? "");

  if (!current || !next || !confirm) {
    return { ok: false, error: "Completa todos los campos." };
  }
  if (next !== confirm) {
    return { ok: false, error: "La confirmación no coincide con la nueva contraseña." };
  }
  if (!isStrongEnough(next)) {
    return { ok: false, error: STRENGTH_MSG };
  }
  if (next === current) {
    return { ok: false, error: "La nueva contraseña debe ser distinta a la actual." };
  }

  try {
    const result = await withSystemRls(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, rut: true, passwordHash: true, active: true, role: true },
      });
      if (!user || !user.active) return { ok: false as const, error: "Usuario no válido." };

      const matches = await bcrypt.compare(current, user.passwordHash);
      if (!matches) return { ok: false as const, error: "La contraseña actual no es correcta." };

      const newHash = await hashPassword(next);
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newHash,
          mustChangePassword: false,
        },
      });

      await logAudit({
        tx,
        action: "PASSWORD_CHANGED",
        actorId: user.id,
        message: "Cliente cambió su contraseña desde el portal.",
      });

      return { ok: true as const, rut: user.rut, role: user.role };
    });

    if (!result.ok) return result;

    if (result.role === "CLIENTE" && result.rut) {
      await syncClientPasswordToFinancial({
        rut: result.rut,
        currentPassword: current,
        newPassword: next,
        source: "service-control",
      });
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return { ok: false, error: message };
  }
}
