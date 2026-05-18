import { CaseStage } from "@/lib/db-enums";
import { withSystemRls } from "@/lib/rls";
import { enqueueEmail, enqueueWhatsApp } from "@/lib/notifications";

/**
 * Gatekeeper of entry. Validates the payment status of a newly ingested case.
 * Ensures the system moves cases to WAITING_CUOTAS if initial payment is missing,
 * blocking manual assignment until resolved.
 * 
 * Idempotent operation using transaction.
 */
export async function ingestCase(caseId: string) {
  return await withSystemRls(async (tx) => {
    const kase = await tx.case.findUnique({
      where: { id: caseId },
      select: { id: true, is_paid: true, stage: true },
    });

    if (!kase) throw new Error("Case not found");

    // Only operate on freshly opened cases
    if (kase.stage !== CaseStage.OPEN && kase.stage !== CaseStage.WAITING_CUOTAS) {
      return; // Already progressed past ingestion
    }

    if (kase.is_paid) {
      // If it was already WAITING_CUOTAS, we are progressing it
      if (kase.stage !== CaseStage.OPEN) {
        await tx.case.update({
          where: { id: caseId },
          data: { stage: CaseStage.OPEN },
        });
      }
      // Send payment receipt
      await Promise.allSettled([
        enqueueWhatsApp({ kind: "payment_receipt", caseId }),
        enqueueEmail({ kind: "payment_receipt", caseId }),
      ]);
    } else {
      // If unpaid, lock it in WAITING_CUOTAS
      if (kase.stage !== CaseStage.WAITING_CUOTAS) {
        await tx.case.update({
          where: { id: caseId },
          data: { stage: CaseStage.WAITING_CUOTAS },
        });
      }
      // Send initial invoice / payment link
      await Promise.allSettled([
        enqueueWhatsApp({ kind: "initial_invoice", caseId }),
        enqueueEmail({ kind: "initial_invoice", caseId }),
      ]);
    }
  });
}
