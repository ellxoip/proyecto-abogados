"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { CaseStage, Role } from "@/lib/db-enums";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { enqueueEmail, enqueueWhatsApp } from "@/lib/notifications";

function hasDocumentUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && url.trim().length > 0;
}

function normalizeForSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isResolutionDocumentUpdate(update: { description: string; document_url: string | null }) {
  return hasDocumentUrl(update.document_url) && normalizeForSearch(update.description).includes("resolucion final");
}

export async function finishCase(caseId: string) {
  const session = await auth();
  if (!session) throw new Error("unauthenticated");

  if (
    session.user.role !== Role.ABOGADO &&
    session.user.role !== Role.JEFE_DE_MESA &&
    session.user.role !== Role.SUPER_ADMIN
  ) {
    return { success: false, error: "No tienes permiso para finalizar este caso." };
  }

  return await withRls(async (tx) => {
    const kase = await tx.case.findUnique({
      where: { id: caseId },
      include: {
        abogados: { select: { id: true } },
        updates: {
          orderBy: { createdAt: "desc" },
          select: { id: true, description: true, document_url: true },
        },
      },
    });

    if (!kase) return { success: false, error: "El caso no existe o no esta bajo tu responsabilidad." };
    if (kase.stage === CaseStage.FINISHED) return { success: true, alreadyFinished: true };

    if (kase.stage !== CaseStage.IN_PROGRESS) {
      return { success: false, error: "El caso debe estar En Proceso antes de finalizar." };
    }

    if (session.user.role === Role.ABOGADO && !kase.abogados.some((a) => a.id === session.user.id)) {
      return { success: false, error: "No puedes finalizar un caso que no esta asignado a ti." };
    }

    const resolutionUpdate = kase.updates.find(isResolutionDocumentUpdate);
    if (!resolutionUpdate?.document_url) {
      return {
        success: false,
        error:
          "Adjunta la resolución final del caso antes de finalizar. El cliente descargará ese documento desde su portal.",
      };
    }

    const resolutionDocumentUrl = resolutionUpdate.document_url.trim();

    await tx.case.update({
      where: { id: caseId },
      data: {
        stage: CaseStage.FINISHED,
        resolvedAt: new Date(),
        last_health_check_at: new Date(),
      },
    });

    await tx.update.create({
      data: {
        caseId,
        description:
          `El caso ${kase.code} ha sido concluido exitosamente. ` +
          "Puede descargar la resolución del caso en el documento adjunto.",
        document_url: resolutionDocumentUrl,
      },
    });

    await Promise.allSettled([
      enqueueWhatsApp({ kind: "case_finished", caseId }),
      enqueueEmail({ kind: "case_finished", caseId }),
    ]);

    revalidateTag(`case:${caseId}`);
    revalidatePath("/admin/bandeja");
    revalidatePath("/admin/casos");
    revalidatePath(`/admin/casos/${caseId}`);
    revalidatePath("/portal");
    revalidatePath(`/portal/casos/${caseId}`);

    return { success: true, resolutionDocumentUrl };
  });
}
