"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";

export async function setTwoFactorEnabled(enabled: boolean) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "No autorizado" };

  const code = enabled ? String(Math.floor(100000 + Math.random() * 900000)) : null;

  await withRls(async (tx) => {
    await tx.user.update({
      where: { id: session.user.id },
      data: { secondary_code: code },
    });

    await tx.auditLog.create({
      data: {
        action: "PASSWORD_CHANGED",
        actorId: session.user.id,
        channel: "system",
        status: "ok",
        message: enabled ? "2FA habilitado desde configuracion." : "2FA deshabilitado desde configuracion.",
      },
    });
  });

  revalidatePath("/admin/configuracion");
  return { ok: true, code };
}
