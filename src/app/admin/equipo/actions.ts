"use server";

import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

export async function createCategory(name: string) {
  const session = await auth();
  if (!session || (session.user.role !== Role.SUPER_ADMIN && session.user.role !== Role.JEFE_DE_MESA)) {
    return { ok: false, reason: "No autorizado" };
  }

  try {
    await withRls(async (tx) => {
      await tx.category.create({
        data: { name: name.toUpperCase() }
      });
    });
    revalidatePath("/admin/equipo");
    revalidatePath("/admin/bandeja");
    return { ok: true };
  } catch (err: any) {
    if (err.code === "P2002") return { ok: false, reason: "La categoría ya existe." };
    return { ok: false, reason: err.message };
  }
}

export async function createStaffMember(data: {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  role: "JEFE_DE_MESA" | "ABOGADO";
  managedById?: string; // Jefe de Mesa al que reporta (solo para abogados)
}) {
  const session = await auth();
  if (!session || session.user.role !== Role.SUPER_ADMIN) {
    return { ok: false, reason: "Solo el Super Admin puede crear personal" };
  }

  // Validar que si es abogado, tenga un jefe de mesa asignado
  if (data.role === "ABOGADO" && !data.managedById) {
    return { ok: false, reason: "Debe asignar un Jefe de Mesa responsable para el abogado." };
  }

  try {
    await withRls(async (tx) => {
      // Si se especifica managedById, verificar que existe y es Jefe de Mesa
      if (data.managedById) {
        const jefe = await tx.user.findUnique({
          where: { id: data.managedById },
          select: { role: true },
        });
        if (!jefe || jefe.role !== Role.JEFE_DE_MESA) {
          throw new Error("El responsable seleccionado no es un Jefe de Mesa válido.");
        }
      }

      const hashedPassword = await bcrypt.hash(data.password, 10);

      await tx.user.create({
        data: {
          fullName: data.fullName,
          email: data.email.toLowerCase().trim(),
          phone: data.phone,
          role: data.role === "JEFE_DE_MESA" ? Role.JEFE_DE_MESA : Role.ABOGADO,
          passwordHash: hashedPassword,
          active: true,
          managedById: data.managedById || null,
        }
      });
    });
    revalidatePath("/admin/equipo");
    revalidatePath("/admin/bandeja");
    return { ok: true };
  } catch (err: any) {
    if (err.code === "P2002") return { ok: false, reason: "El email ya está registrado." };
    return { ok: false, reason: err.message };
  }
}
