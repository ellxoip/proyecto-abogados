/*
  Warnings:

  - You are about to drop the column `abogado_id` on the `cases` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[rut]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "Satisfaction" AS ENUM ('HAPPY', 'NEUTRAL', 'SAD');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'SATISFACTION_SUBMITTED';

-- DropForeignKey
ALTER TABLE "cases" DROP CONSTRAINT "cases_abogado_id_fkey";

-- DropIndex
DROP INDEX "cases_abogado_id_idx";

-- AlterTable
ALTER TABLE "cases" DROP COLUMN "abogado_id",
ADD COLUMN     "cantidad_cuotas" INTEGER,
ADD COLUMN     "ccto" DECIMAL(12,2),
ADD COLUMN     "deadlineAt" TIMESTAMP(3),
ADD COLUMN     "dia_pago" INTEGER,
ADD COLUMN     "fecha_primera_cuota" DATE,
ADD COLUMN     "internalNotes" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "pago_inicial" DECIMAL(12,2),
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "saldo_financiado" DECIMAL(12,2),
ADD COLUMN     "satisfaction" "Satisfaction",
ADD COLUMN     "unpaid_months" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payment_events" ADD COLUMN     "fecha_vencimiento" DATE,
ADD COLUMN     "monto_pagado" DECIMAL(12,2),
ADD COLUMN     "numero_cuota" INTEGER,
ADD COLUMN     "pagado_en" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "rut" TEXT;

-- CreateTable
CREATE TABLE "_CaseLawyers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_CaseLawyers_AB_unique" ON "_CaseLawyers"("A", "B");

-- CreateIndex
CREATE INDEX "_CaseLawyers_B_index" ON "_CaseLawyers"("B");

-- CreateIndex
CREATE UNIQUE INDEX "users_rut_key" ON "users"("rut");

-- AddForeignKey
ALTER TABLE "_CaseLawyers" ADD CONSTRAINT "_CaseLawyers_A_fkey" FOREIGN KEY ("A") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CaseLawyers" ADD CONSTRAINT "_CaseLawyers_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
