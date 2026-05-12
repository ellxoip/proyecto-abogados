import { Prisma, AuditAction } from "@prisma/client";

type AuditParams = {
  tx: Prisma.TransactionClient;
  action: AuditAction;
  caseId?: string;
  actorId?: string;
  message?: string;
  metadata?: any;
};

/**
 * Centralized audit engine. 
 * MUST be called within an existing transaction (Prisma.TransactionClient).
 */
export async function logAudit({ tx, action, caseId, actorId, message, metadata }: AuditParams) {
  try {
    await tx.auditLog.create({
      data: {
        action,
        caseId,
        actorId,
        message,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
      }
    });
  } catch (err) {
    // Audit should be best-effort or fail the transaction? 
    // Usually audit is critical, so we let it throw to roll back the tx if logging fails.
    console.error("Failed to log audit:", err);
    throw err;
  }
}