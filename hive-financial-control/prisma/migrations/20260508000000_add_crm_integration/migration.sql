-- Migration: add_crm_integration
-- Adds PENDING_INITIAL_PAYMENT to EstadoContrato enum and ensures CRM tracking
-- columns exist on Contrato. CRM columns may already exist from prior manual migration.

-- Step 1: Add PENDING_INITIAL_PAYMENT to EstadoContrato enum
BEGIN;
CREATE TYPE "EstadoContrato_new" AS ENUM (
  'PENDING_INITIAL_PAYMENT',
  'ACTIVO',
  'PAGADO',
  'EN_MORA',
  'REPACTADO',
  'TERMINADO',
  'ANULADO'
);
ALTER TABLE "Contrato" ALTER COLUMN "estado" DROP DEFAULT;
ALTER TABLE "Contrato" ALTER COLUMN "estado" TYPE "EstadoContrato_new"
  USING ("estado"::text::"EstadoContrato_new");
ALTER TYPE "EstadoContrato" RENAME TO "EstadoContrato_old";
ALTER TYPE "EstadoContrato_new" RENAME TO "EstadoContrato";
DROP TYPE "EstadoContrato_old";
ALTER TABLE "Contrato" ALTER COLUMN "estado" SET DEFAULT 'ACTIVO';
COMMIT;

-- Step 2: Add CRM tracking columns if they don't already exist
ALTER TABLE "Contrato"
  ADD COLUMN IF NOT EXISTS "crm_lead_id"          INTEGER,
  ADD COLUMN IF NOT EXISTS "crm_opportunity_id"   VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "correlation_id"       VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "idempotency_key"      VARCHAR(200);

-- Step 3: Add unique constraints (skip if index already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'Contrato' AND indexname = 'Contrato_crm_opportunity_id_key'
  ) THEN
    CREATE UNIQUE INDEX "Contrato_crm_opportunity_id_key"
      ON "Contrato"("crm_opportunity_id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'Contrato' AND indexname = 'Contrato_idempotency_key_key'
  ) THEN
    CREATE UNIQUE INDEX "Contrato_idempotency_key_key"
      ON "Contrato"("idempotency_key");
  END IF;
END $$;
