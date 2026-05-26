"use server";

import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { Role, AuditAction } from "@/lib/db-enums";
import { revalidatePath } from "next/cache";
import { enqueueWhatsApp } from "@/lib/notifications";
import { reactivateCaseIfPaid } from "@/lib/case-health";

async function assertSuperAdmin() {
  const session = await auth();
  if (!session) throw new Error("unauthenticated");
  if (session.user.role !== Role.SUPER_ADMIN) {
    throw new Error("forbidden: only SuperAdmin may operate on mora");
  }
  return session;
}

export async function remindClient(caseId: string) {
  await assertSuperAdmin();
  return await withRls(async (tx) => {
    await tx.auditLog.create({
      data: {
        action: AuditAction.WHATSAPP_SENT,
        caseId,
        channel: "whatsapp",
        template: "overdue_notice_manual",
        status: "ok",
        message: "Aviso No Pago manual emitido por SuperAdmin",
      },
    });

    await enqueueWhatsApp({ kind: "overdue_notice", caseId });
    return { ok: true };
  });
}

/**
 * Diagrama: "¿Pago Regularizado? -> SI" valida el pago en mora y devuelve el
 * caso al nodo "¿Pago Inicial validado?" (stage = OPEN). Solo SuperAdmin.
 */
export async function regularizeCase(caseId: string) {
  await assertSuperAdmin();
  return await withRls(async (tx) => {
    await reactivateCaseIfPaid(tx, caseId);

    await tx.auditLog.create({
      data: {
        action: AuditAction.CASE_REACTIVATED,
        caseId,
        status: "ok",
        message: "Pago regularizado por SuperAdmin. Caso vuelve a Bandeja para validación.",
      },
    });

    revalidatePath("/admin/bandeja");
    revalidatePath("/admin/mora");
    revalidatePath(`/admin/casos/${caseId}`);
    return { ok: true };
  });
}
