-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('CRM', 'MANUAL', 'WEB');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CONTACTED', 'CONVERTED', 'CANCELED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "LeadPriority" AS ENUM ('BAJA', 'NORMAL', 'ALTA', 'URGENTE');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'LEAD_NUEVO';
ALTER TYPE "NotificationType" ADD VALUE 'LEAD_RECORDATORIO';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "leadId" TEXT;

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "source" "LeadSource" NOT NULL DEFAULT 'CRM',
    "status" "LeadStatus" NOT NULL DEFAULT 'PENDING',
    "rut" TEXT,
    "rutEmpresa" TEXT,
    "empresa" TEXT,
    "ciudad" TEXT,
    "assignedAbogadoId" TEXT NOT NULL,
    "scheduledById" TEXT,
    "meetingAt" TIMESTAMP(3) NOT NULL,
    "meetingDuration" INTEGER NOT NULL DEFAULT 30,
    "category" TEXT,
    "notes" TEXT,
    "priority" "LeadPriority" NOT NULL DEFAULT 'NORMAL',
    "vendedor" TEXT,
    "agendadora" TEXT,
    "honorarios" DECIMAL(12,2),
    "cuotaInicial" DECIMAL(12,2),
    "numCuotas" INTEGER,
    "montoCuota" DECIMAL(12,2),
    "descripcion" TEXT,
    "notasInternas" TEXT,
    "externalId" TEXT,
    "metadata" JSONB,
    "contactedAt" TIMESTAMP(3),
    "confirmationSentAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "reassignedAt" TIMESTAMP(3),
    "previousAbogadoId" TEXT,
    "stuckNotifiedAt" TIMESTAMP(3),
    "convertedCaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leads_convertedCaseId_key" ON "leads"("convertedCaseId");

-- CreateIndex
CREATE INDEX "leads_assignedAbogadoId_meetingAt_idx" ON "leads"("assignedAbogadoId", "meetingAt");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_meetingAt_idx" ON "leads"("meetingAt");

-- CreateIndex
CREATE INDEX "leads_reminderSentAt_idx" ON "leads"("reminderSentAt");

-- CreateIndex
CREATE INDEX "leads_confirmationSentAt_idx" ON "leads"("confirmationSentAt");

-- CreateIndex
CREATE INDEX "leads_rut_idx" ON "leads"("rut");

-- CreateIndex
CREATE INDEX "leads_empresa_idx" ON "leads"("empresa");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignedAbogadoId_fkey" FOREIGN KEY ("assignedAbogadoId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_scheduledById_fkey" FOREIGN KEY ("scheduledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
