"use server";

import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

export async function updateProfile(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "No autorizado" };

  const fullName = formData.get("fullName") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  try {
    const data: any = {
      fullName,
      email: email.toLowerCase().trim(),
    };

    if (password && password.length > 0) {
      if (password.length < 6) return { success: false, error: "La contraseña debe tener al menos 6 caracteres" };
      data.passwordHash = await bcrypt.hash(password, 10);
    }

    await withRls(async (tx) => {
      await tx.user.update({
        where: { id: session.user.id },
        data,
      });

      // Auditoría
      await tx.auditLog.create({
        data: {
          action: "PASSWORD_CHANGED",
          actorId: session.user.id,
          channel: "system",
          message: `Perfil actualizado por el usuario ${fullName}`,
          status: "ok",
        },
      });
    });

    revalidatePath("/admin/perfil");
    return { success: true };
  } catch (error: any) {
    if (error.code === 'P2002') return { success: false, error: "El email ya está en uso" };
    return { success: false, error: "Error al actualizar perfil" };
  }
}
