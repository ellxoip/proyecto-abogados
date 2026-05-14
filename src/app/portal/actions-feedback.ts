"use server";

import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { Satisfaction, AuditAction, CaseStage, Role } from "@/lib/db-enums";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";

export async function submitSatisfaction(caseId: string, satisfaction: Satisfaction) {
  const session = await auth();
  if (!session) return { ok: false, reason: "No autenticado" };
  if (session.user.role !== Role.CLIENTE) return { ok: false, reason: "Solo el cliente puede evaluar su experiencia." };

  return await withRls(async (tx) => {
    // Verify the client owns this case before allowing feedback
    const kase = await tx.case.findFirst({
      where: { id: caseId, client_id: session.user.id },
      select: { id: true, stage: true },
    });
    if (!kase) return { ok: false, reason: "Caso no encontrado" };
    if (kase.stage !== CaseStage.FINISHED) {
      return { ok: false, reason: "La evaluacion se habilita al finalizar el caso." };
    }

    await tx.case.update({
      where: { id: caseId },
      data: { satisfaction },
    });

    await logAudit({
      tx,
      action: AuditAction.SATISFACTION_SUBMITTED,
      caseId,
      message: `Cliente calificó el servicio como: ${satisfaction}`,
      metadata: { satisfaction }
    });

    revalidatePath(`/portal/casos/${caseId}`);
    return { ok: true };
  });
}
