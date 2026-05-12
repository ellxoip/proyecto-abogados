-- CreateEnum
CREATE TYPE "CaseCategory" AS ENUM ('TRIBUTARIO', 'PENAL', 'CIVIL', 'LABORAL', 'FAMILIA', 'MIGRATORIO', 'OTRO');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('WHATSAPP_SENT', 'WHATSAPP_FAILED', 'EMAIL_SENT', 'EMAIL_FAILED', 'CASE_HALTED', 'CASE_REACTIVATED', 'CASE_FINISHED', 'CASE_DERIVED', 'CASE_ASSIGNED', 'PAYMENT_RECORDED');

-- AlterTable
ALTER TABLE "cases" ADD COLUMN     "category" "CaseCategory",
ADD COLUMN     "halted_at" TIMESTAMP(3),
ADD COLUMN     "halted_reason" TEXT,
ADD COLUMN     "last_health_check_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "caseId" TEXT,
    "actorId" TEXT,
    "channel" TEXT,
    "template" TEXT,
    "status" TEXT,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_caseId_idx" ON "audit_logs"("caseId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "cases_category_idx" ON "cases"("category");
