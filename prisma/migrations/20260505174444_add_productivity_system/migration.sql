/*
  Warnings:

  - You are about to drop the column `abogado_id` on the `cases` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "Satisfaction" AS ENUM ('HAPPY', 'NEUTRAL', 'SAD');

-- CreateEnum
CREATE TYPE "ActivityCategory" AS ENUM ('INVESTIGACION', 'REDACCION', 'AUDIENCIAS', 'REUNIONES', 'GESTION_ADMINISTRATIVA', 'OTRO');

-- CreateEnum
CREATE TYPE "SlaStatus" AS ENUM ('CUMPLIDO', 'EN_RIESGO', 'INCUMPLIDO');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('BAJO', 'MEDIO', 'ALTO', 'CRITICO');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SLA_RIESGO', 'SLA_INCUMPLIDO', 'CASO_ESTANCADO', 'IA_URGENTE', 'RESUMEN_SEMANAL', 'RECORDATORIO_HORAS');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'SATISFACTION_SUBMITTED';

-- DropForeignKey
ALTER TABLE "cases" DROP CONSTRAINT "cases_abogado_id_fkey";

-- DropIndex
DROP INDEX "cases_abogado_id_idx";

-- AlterTable
ALTER TABLE "cases" DROP COLUMN "abogado_id",
ADD COLUMN     "deadlineAt" TIMESTAMP(3),
ADD COLUMN     "internalNotes" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "satisfaction" "Satisfaction",
ADD COLUMN     "unpaid_months" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lastSeenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "lawyerId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "category" "ActivityCategory" NOT NULL,
    "description" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_definitions" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "maxDays" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sla_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "caseId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_case_analyses" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "healthScore" INTEGER NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "estimatedDays" INTEGER,
    "minDays" INTEGER,
    "maxDays" INTEGER,
    "stagnant" BOOLEAN NOT NULL DEFAULT false,
    "explanation" TEXT NOT NULL,
    "recommendations" JSONB,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_case_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productivity_snapshots" (
    "id" TEXT NOT NULL,
    "lawyerId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "casesAssigned" INTEGER NOT NULL DEFAULT 0,
    "casesFinished" INTEGER NOT NULL DEFAULT 0,
    "totalMinutes" INTEGER NOT NULL DEFAULT 0,
    "avgMinutesPerCase" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "slaCompliancePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgDaysToFinish" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "compositeScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "productivity_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CaseLawyers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "time_entries_caseId_idx" ON "time_entries"("caseId");

-- CreateIndex
CREATE INDEX "time_entries_lawyerId_idx" ON "time_entries"("lawyerId");

-- CreateIndex
CREATE INDEX "time_entries_date_idx" ON "time_entries"("date");

-- CreateIndex
CREATE UNIQUE INDEX "sla_definitions_categoryId_key" ON "sla_definitions"("categoryId");

-- CreateIndex
CREATE INDEX "notifications_userId_read_idx" ON "notifications"("userId", "read");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE INDEX "ai_case_analyses_caseId_idx" ON "ai_case_analyses"("caseId");

-- CreateIndex
CREATE INDEX "ai_case_analyses_analyzedAt_idx" ON "ai_case_analyses"("analyzedAt");

-- CreateIndex
CREATE INDEX "productivity_snapshots_lawyerId_idx" ON "productivity_snapshots"("lawyerId");

-- CreateIndex
CREATE INDEX "productivity_snapshots_periodStart_idx" ON "productivity_snapshots"("periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "_CaseLawyers_AB_unique" ON "_CaseLawyers"("A", "B");

-- CreateIndex
CREATE INDEX "_CaseLawyers_B_index" ON "_CaseLawyers"("B");

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_definitions" ADD CONSTRAINT "sla_definitions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_definitions" ADD CONSTRAINT "sla_definitions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_case_analyses" ADD CONSTRAINT "ai_case_analyses_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productivity_snapshots" ADD CONSTRAINT "productivity_snapshots_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CaseLawyers" ADD CONSTRAINT "_CaseLawyers_A_fkey" FOREIGN KEY ("A") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CaseLawyers" ADD CONSTRAINT "_CaseLawyers_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
