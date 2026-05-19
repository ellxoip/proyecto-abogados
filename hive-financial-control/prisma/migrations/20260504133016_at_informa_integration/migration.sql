ALTER TABLE "Cliente" ADD COLUMN "external_id" VARCHAR(80);
CREATE UNIQUE INDEX "Cliente_external_id_key" ON "Cliente"("external_id");

ALTER TABLE "Contrato"
  ADD COLUMN "codigo_externo" VARCHAR(120),
  ADD COLUMN "fecha_primera_cuota" DATE,
  ADD COLUMN "dia_pago" INTEGER,
  ADD COLUMN "total_pagado" DECIMAL(14,2),
  ADD COLUMN "saldo_pendiente" DECIMAL(14,2),
  ADD COLUMN "saldo_vencido" DECIMAL(14,2);

ALTER TABLE "Cuota"
  ADD COLUMN "external_id" VARCHAR(80),
  ADD COLUMN "comprobante_url" VARCHAR(500);
CREATE UNIQUE INDEX "Cuota_external_id_key" ON "Cuota"("external_id");

ALTER TABLE "Pago"
  ADD COLUMN "external_id" VARCHAR(120),
  ADD COLUMN "sync_status" VARCHAR(30),
  ADD COLUMN "external_sync_error" TEXT;

CREATE TABLE "ExternalSyncLog" (
  "id" SERIAL NOT NULL,
  "tipo" VARCHAR(100) NOT NULL,
  "status" VARCHAR(30) NOT NULL,
  "total_registros" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalSyncLog_pkey" PRIMARY KEY ("id")
);
