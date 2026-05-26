"use server";

import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { Role } from "@/lib/db-enums";
import { revalidatePath } from "next/cache";

export async function saveInternalNotes(caseId: string, notes: string) {
  const session = await auth();
  if (!session) throw new Error("unauthenticated");

  const role = session.user.role;
  if (role !== Role.SUPER_ADMIN && role !== Role.JEFE_DE_MESA) {
    throw new Error("Solo SuperAdmin y Jefe de Grupo pueden escribir notas internas.");
  }

  await withRls(async (tx) => {
    await tx.case.update({
      where: { id: caseId },
      data: { internalNotes: notes },
    });
  });

  revalidatePath(`/admin/casos/${caseId}`);
  return { ok: true };
}
