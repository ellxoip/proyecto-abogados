"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { CaseStage, Role } from "@/lib/db-enums";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { logAudit } from "@/lib/audit";
import { canTransition } from "@/lib/case-health";

/**
 * Advances a case from OPEN → IN_PROGRESS.
 * Called when the Abogado starts working on the case.
 */
export async function advanceToInProgress(caseId: string) {
  const session = await auth();
  if (!session) return { success: false, error: "No autorizado" };
  if (session.user.role !== Role.ABOGADO && session.user.role !== Role.SUPER_ADMIN && session.user.role !== Role.JEFE_DE_MESA) {
    return { success: false, error: "Sin permisos" };
  }

  return await withRls(async (tx) => {
    const kase = await tx.case.findUnique({
      where: { id: caseId },
      include: { abogados: { select: { id: true } } },
    });

    if (!kase) return { success: false, error: "Caso no encontrado" };

    if (kase.stage === CaseStage.IN_PROGRESS) {
      return { success: true, alreadyAdvanced: true };
    }

    if (!canTransition(kase.stage, CaseStage.IN_PROGRESS)) {
      return { success: false, error: `No se puede avanzar el caso desde el estado actual: ${kase.stage}` };
    }

    if (kase.abogados.length === 0) {
      return {
        success: false,
        error: "El caso debe tener un abogado asignado antes de iniciar desarrollo.",
      };
    }

    if (session.user.role === Role.ABOGADO && !kase.abogados.some((a) => a.id === session.user.id)) {
      return {
        success: false,
        error: "No puedes iniciar desarrollo de un caso que no esta asignado a ti.",
      };
    }

    await tx.case.update({
      where: { id: caseId },
      data: { stage: CaseStage.IN_PROGRESS },
    });

    await logAudit({
      tx,
      action: "CASE_ASSIGNED",
      caseId,
      actorId: session.user.id,
      message: `Caso avanzado a EN DESARROLLO por ${session.user.name}`,
    });

    revalidateTag(`case:${caseId}`);
    revalidatePath(`/admin/casos/${caseId}`);
    revalidatePath("/admin/bandeja");
    revalidatePath("/portal");

    return { success: true };
  });
}
