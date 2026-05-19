import { Prisma } from "@prisma/client";
import { AuditAction } from "@/lib/db-enums";

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
        metadata:
          metadata === undefined || metadata === null
            ? undefined
            : typeof metadata === "string"
              ? metadata
              : JSON.stringify(metadata),
      }
    });
  } catch (err) {
    // Audit should be best-effort or fail the transaction? 
    // Usually audit is critical, so we let it throw to roll back the tx if logging fails.
    console.error("Failed to log audit:", err);
    throw err;
  }
}