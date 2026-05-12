import { CaseStage, PaymentStatus, Prisma } from "@prisma/client";
import { withSystemRls } from "@/lib/rls";
import { reactivateCaseIfPaid, forceHalt } from "@/lib/case-health";

export type InternalPaymentEvent = {
  caseId: string;
  status: PaymentStatus;
  amount: number;
  receiptUrl?: string;
  /** Free-form id from the manual workflow (e.g. SuperAdmin validation note). */
  externalId?: string;
};

/**
 * Internal payment sink. Used by:
 *   - SuperAdmin "¿Pago Inicial validado?" decision in the bandeja.
 *   - Sistema de Cuotas regularization ("¿Pago Regularizado?" -> SI).
 *   - Manual receipt validation triggered by staff after the client uploads
 *     proof of payment from the portal.
 *
 * There are NO external payment providers in this project. This function
 * creates the PaymentEvent and, when the status closes the arrears, returns
 * the case to the SuperAdmin validation node in the SAME transaction so
 * observers never see a half-state.
 */
export async function recordPaymentEvent(payload: InternalPaymentEvent) {
  const { caseId, status, amount, receiptUrl } = payload;

  return withSystemRls(async (tx) => {
    const event = await tx.paymentEvent.create({
      data: {
        caseId,
        status,
        amount: new Prisma.Decimal(amount),
        receipt_url: receiptUrl ?? null,
      },
    });

    if (status === PaymentStatus.PAID || status === PaymentStatus.RESTORED) {
      const health = await reactivateCaseIfPaid(tx, caseId);
      return { event, caseHealth: health };
    }

    if (status === PaymentStatus.OVERDUE) {
      await forceHalt(tx, caseId, "Cuota vencida — caso pasa a Sistema de Cuotas");
    }

    return { event, caseHealth: null };
  });
}

/**
 * "Tarea de sistema" del diagrama: cualquier caso que tenga su Boleta
 * automática cargada pero cuyo Pago Inicial no haya sido validado por el
 * SuperAdmin dentro del TTL configurado se mueve a HALTED_BY_PAYMENT y entra
 * al Sistema de Cuotas. Ejecutado por el worker recurrente.
 */
export async function haltStaleInvoices(ttlHours = 24): Promise<number> {
  const cutoff = new Date(Date.now() - ttlHours * 60 * 60 * 1000);

  return withSystemRls(async (tx) => {
    const stale = await tx.case.findMany({
      where: {
        is_paid: false,
        initial_invoice: { not: null },
        createdAt: { lt: cutoff },
        stage: { notIn: [CaseStage.HALTED_BY_PAYMENT, CaseStage.FINISHED] },
      },
      select: { id: true },
    });

    for (const c of stale) {
      await forceHalt(tx, c.id, `Boleta inicial sin validar por SuperAdmin (>${ttlHours}h)`);
    }
    return stale.length;
  });
}
