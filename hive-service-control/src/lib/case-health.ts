import { Prisma } from "@prisma/client";
import { CaseStage, PaymentStatus } from "@/lib/db-enums";
import { revalidatePath, revalidateTag } from "next/cache";
import { enqueueWhatsApp, enqueueEmail } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";

// ============================================
// STATE MACHINE - Legal OS v3.0 "The Destination Experience"
// ============================================

/**
 * Result-oriented messages for each stage.
 * 90% UI focus on progress and destination, 10% on mechanics.
 */
export const STAGE_MESSAGES: Record<CaseStage, { title: string; description: string; action?: string }> = {
  [CaseStage.OPEN]: {
    title: "Iniciando tu defensa legal",
    description: "Estamos preparando la estrategia para tu caso. El primer paso es la validación administrativa.",
    action: "Validando ingreso",
  },
  [CaseStage.IN_PROGRESS]: {
    title: "Protegiendo tu futuro",
    description: "Tu caso está activo y bajo la supervisión de nuestros expertos legales. Estamos avanzando según lo planeado.",
    action: undefined,
  },
  [CaseStage.HALTED_BY_PAYMENT]: {
    title: "Resguardando tu proceso legal",
    description: "Tu caso está en pausa temporal para asegurar la continuidad financiera del servicio. Al regularizar, retomaremos la defensa de inmediato.",
    action: "Regularizar para continuar",
  },
  [CaseStage.WAITING_CUOTAS]: {
    title: "Asegurando tu plan de pagos",
    description: "Estamos procesando tu solicitud de cuotas para que puedas continuar con tranquilidad. Te avisaremos apenas esté listo.",
    action: "Ver estado de solicitud",
  },
  [CaseStage.FINISHED]: {
    title: "¡Objetivo Alcanzado!",
    description: "Tu proceso legal ha concluido con éxito. Ya puedes descargar tu documentación final.",
    action: "Descargar resultados",
  },
};

/**
 * State Machine Transitions - Explicit and Validated
 * Each transition is validated before execution.
 */
export const STATE_MACHINE: Record<CaseStage, CaseStage[]> = {
  [CaseStage.OPEN]: [CaseStage.IN_PROGRESS, CaseStage.WAITING_CUOTAS, CaseStage.HALTED_BY_PAYMENT],
  [CaseStage.IN_PROGRESS]: [CaseStage.HALTED_BY_PAYMENT, CaseStage.FINISHED],
  [CaseStage.HALTED_BY_PAYMENT]: [CaseStage.IN_PROGRESS, CaseStage.OPEN], 
  [CaseStage.WAITING_CUOTAS]: [CaseStage.OPEN, CaseStage.IN_PROGRESS, CaseStage.HALTED_BY_PAYMENT],
  [CaseStage.FINISHED]: [], 
};

export function canTransition(from: CaseStage, to: CaseStage): boolean {
  return STATE_MACHINE[from]?.includes(to) ?? false;
}

export function getStageMessage(stage: CaseStage) {
  return STAGE_MESSAGES[stage] || { title: "En proceso", description: "Estamos trabajando en ello." };
}

// ============================================
// ERROR CLASSES
// ============================================

export class CaseHaltedError extends Error {
  readonly caseId: string;
  readonly reason: string;
  constructor(caseId: string, reason: string) {
    super(`Acción bloqueada: ${reason}`);
    this.name = "CaseHaltedError";
    this.caseId = caseId;
    this.reason = reason;
  }
}

export class InvalidStateTransitionError extends Error {
  constructor(from: CaseStage, to: CaseStage) {
    super(`Transición no permitida de ${from} a ${to}`);
    this.name = "InvalidStateTransitionError";
  }
}

// ============================================
// LOGIC
// ============================================

export type CaseHealth = {
  caseId: string;
  stage: CaseStage;
  is_paid: boolean;
  allowed: boolean;
  reason?: string;
  is_delicate: boolean;
  resultMessage: { title: string; description: string; action?: string };
};

const BLOCKING_PAYMENT_STATUSES: PaymentStatus[] = [
  PaymentStatus.UNPAID,
  PaymentStatus.OVERDUE,
];

const TERMINALLY_BLOCKED: CaseStage[] = [
  CaseStage.HALTED_BY_PAYMENT,
  CaseStage.WAITING_CUOTAS,
  CaseStage.FINISHED,
];

/**
 * Single source of truth for case health and policy enforcement.
 */
export async function checkCaseHealth(
  tx: Prisma.TransactionClient,
  caseId: string,
): Promise<CaseHealth> {
  const c = await tx.case.findUnique({
    where: { id: caseId },
    include: {
      payments: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  
  if (!c) throw new Error("Case not found");

  const lastPayment = c.payments[0]?.status;
  const inArrears = !c.is_paid || (lastPayment && BLOCKING_PAYMENT_STATUSES.includes(lastPayment));

  // Reset delinquency if paid
  if (!inArrears && c.unpaid_months > 0) {
    await tx.case.update({
      where: { id: caseId },
      data: { unpaid_months: 0 }
    });
    await logAudit({
      tx,
      action: "CASE_REACTIVATED",
      caseId,
      message: "Deuda regularizada. Contador de mora reiniciado.",
    });
  }

  // Escalation logic for cases in arrears
  if (inArrears && c.stage !== CaseStage.FINISHED) {
    // If it's been more than 30 days since last check (or first time), increment month
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const shouldIncrement = !c.last_health_check_at || c.last_health_check_at < thirtyDaysAgo;

    let currentUnpaid = c.unpaid_months;
    if (shouldIncrement) {
      currentUnpaid += 1;
      await tx.case.update({
        where: { id: caseId },
        data: { 
          unpaid_months: currentUnpaid,
          last_health_check_at: new Date()
        }
      });

      // Diagrama: "Aviso No Pago WhatsApp + Email" en cada escalamiento.
      if (currentUnpaid === 1) {
        await enqueueWhatsApp({ kind: "non_payment_warning", caseId });
        await enqueueEmail({ kind: "non_payment_warning", caseId });
        await logAudit({ tx, action: "EMAIL_SENT", caseId, message: "Mora Mes 1: Alerta enviada" });
      } else if (currentUnpaid === 2) {
        await enqueueWhatsApp({ kind: "overdue_notice", caseId });
        await enqueueEmail({ kind: "overdue_notice", caseId });
        await logAudit({ tx, action: "EMAIL_SENT", caseId, message: "Mora Mes 2: Segundo aviso de mora" });
      } else if (currentUnpaid >= 3 && c.stage !== CaseStage.HALTED_BY_PAYMENT) {
        // Mes 3: HALT + cancelación de cuenta del cliente.
        await tx.case.update({
          where: { id: caseId },
          data: {
            stage: CaseStage.HALTED_BY_PAYMENT,
            halted_at: new Date(),
            halted_reason: "Mora Mes 3: Cuenta del cliente cancelada por impago sostenido.",
          },
        });
        await tx.user.update({
          where: { id: c.client_id },
          data: { active: false },
        });
        await enqueueWhatsApp({ kind: "overdue_notice", caseId });
        await enqueueEmail({ kind: "overdue_notice", caseId });
        await logAudit({ tx, action: "CASE_HALTED", caseId, message: "Mora Mes 3: Proceso detenido y cuenta del cliente cancelada." });
      }
    }

    if (currentUnpaid >= 3 || c.stage === CaseStage.HALTED_BY_PAYMENT) {
      return {
        caseId,
        stage: CaseStage.HALTED_BY_PAYMENT,
        is_paid: c.is_paid,
        allowed: false,
        reason: "Mora Mes 3: Derivado a Sistema de Cuotas",
        is_delicate: c.is_delicate,
        resultMessage: STAGE_MESSAGES[CaseStage.HALTED_BY_PAYMENT],
      };
    }
  }


  const allowed = !TERMINALLY_BLOCKED.includes(c.stage);

  return {
    caseId,
    stage: c.stage,
    is_paid: c.is_paid,
    allowed,
    is_delicate: c.is_delicate,
    reason: allowed ? undefined : (c.halted_reason ?? "Estado administrativo"),
    resultMessage: STAGE_MESSAGES[c.stage],
  };
}

/**
 * Ensures the case is active before performing any staff action.
 */
export async function assertCaseActive(
  tx: Prisma.TransactionClient,
  caseId: string,
): Promise<void> {
  const health = await checkCaseHealth(tx, caseId);
  if (!health.allowed) {
    throw new CaseHaltedError(caseId, health.reason ?? "Bloqueado");
  }
}

/**
 * Unified state transitioner with audit and validation.
 */
export async function transitionCase(
  tx: Prisma.TransactionClient,
  caseId: string,
  to: CaseStage,
  actorId: string,
  reason?: string
) {
  const c = await tx.case.findUnique({ where: { id: caseId } });
  if (!c) throw new Error("Case not found");

  if (!canTransition(c.stage, to)) {
    throw new InvalidStateTransitionError(c.stage, to);
  }

  await tx.case.update({
    where: { id: caseId },
    data: {
      stage: to,
      halted_at: to === CaseStage.HALTED_BY_PAYMENT ? new Date() : null,
      halted_reason: to === CaseStage.HALTED_BY_PAYMENT ? reason : null,
    },
  });

  await logAudit({
    tx,
    action: "CASE_HALTED", // Use generic or specific? The enum has restricted values.
    caseId,
    actorId,
    message: `Transición de estado: ${c.stage} -> ${to}. Motivo: ${reason ?? "N/A"}`,
    metadata: { from: c.stage, to }
  });

  invalidateCaseCaches(caseId);
}

/**
 * Loop de retorno del diagrama: cuando el "¿Pago Regularizado?" es SI
 * (validado por SuperAdmin tras Sistema de Cuotas), el caso vuelve al nodo
 * "¿Pago Inicial validado?" — NO salta directo a IN_PROGRESS. Por eso el
 * stage queda en OPEN y la decisión de reanudar la cae al SuperAdmin desde
 * la bandeja.
 */
export async function reactivateCaseIfPaid(
  tx: Prisma.TransactionClient,
  caseId: string,
): Promise<CaseHealth | null> {

  const c = await tx.case.findUnique({
    where: { id: caseId },
    include: {
      abogados: { select: { id: true } },
    },
  });
  if (!c) return null;

  // Per diagram: if lawyers are already assigned, resume IN_PROGRESS.
  // Otherwise return to OPEN for SuperAdmin double-check.
  const resumeStage = c.abogados.length > 0 ? CaseStage.IN_PROGRESS : CaseStage.OPEN;

  await tx.case.update({
    where: { id: caseId },
    data: {
      is_paid: true,
      stage: resumeStage,
      halted_at: null,
      halted_reason: null,
      unpaid_months: 0,
    },
  });

  // Re-enable client account (was deactivated at Month 3 halt)
  await tx.user.update({
    where: { id: c.client_id },
    data: { active: true },
  });

  await logAudit({
    tx,
    action: "CASE_REACTIVATED",
    caseId,
    message: `Pago regularizado. Caso reactivado a ${resumeStage}. Cuenta del cliente reactivada.`,
  });

  await enqueueWhatsApp({ kind: "payment_receipt", caseId });
  invalidateCaseCaches(caseId);

  return checkCaseHealth(tx, caseId);
}

/**
 * Moves cases that have been WAITING_CUOTAS for too long to HALTED_BY_PAYMENT.
 */
export async function markStaleAsWaiting(tx: Prisma.TransactionClient, days = 7) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const stale = await tx.case.findMany({
    where: {
      stage: CaseStage.WAITING_CUOTAS,
      updatedAt: { lt: cutoff },
    },
    select: { id: true },
  });

  for (const c of stale) {
    await tx.case.update({
      where: { id: c.id },
      data: {
        stage: CaseStage.HALTED_BY_PAYMENT,
        halted_reason: `Inactivo en espera de cuotas por más de ${days} días.`,
        halted_at: new Date(),
      },
    });
  }
}


export async function forceHalt(
  tx: Prisma.TransactionClient,
  caseId: string,
  reason: string,
  actorId?: string
): Promise<void> {
  const c = await tx.case.findUnique({ where: { id: caseId } });
  if (!c) return;

  await tx.case.update({
    where: { id: caseId },
    data: {
      stage: CaseStage.HALTED_BY_PAYMENT,
      halted_at: new Date(),
      halted_reason: reason,
    },
  });

  await logAudit({
    tx,
    action: "CASE_HALTED",
    caseId,
    actorId,
    message: `Bloqueo forzado: ${reason}`,
  });

  // Diagrama: "Aviso No Pago WhatsApp + Email" se dispara al detener el caso.
  await enqueueWhatsApp({ kind: "overdue_notice", caseId });
  await enqueueEmail({ kind: "overdue_notice", caseId });
  invalidateCaseCaches(caseId);
}

function invalidateCaseCaches(caseId: string) {
  try {
    revalidateTag(`case:${caseId}`);
    revalidatePath("/admin/bandeja");
    revalidatePath(`/admin/casos/${caseId}`);
    revalidatePath(`/portal/casos/${caseId}`);
  } catch { /* worker scope */ }
}
