/*
  Warnings:

  - A unique constraint covering the columns `[cliente_id,tipo_servicio,monto_ccto,fecha_contrato]` on the table `Contrato` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('PREVIEW_READY', 'PROCESSING', 'CONFIRMED', 'FAILED');

-- CreateTable
CREATE TABLE "ClienteContacto" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "email" VARCHAR(180),
    "telefono" VARCHAR(30),
    "cargo" VARCHAR(120),
    "es_principal" BOOLEAN NOT NULL DEFAULT false,
    "recibe_notificaciones" BOOLEAN NOT NULL DEFAULT false,
    "recibe_comprobantes" BOOLEAN NOT NULL DEFAULT false,
    "whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClienteContacto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClienteFacturacion" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "rut_facturacion" VARCHAR(20) NOT NULL,
    "razon_social_facturacion" VARCHAR(200) NOT NULL,
    "giro_facturacion" VARCHAR(200),
    "direccion_facturacion" VARCHAR(255),
    "comuna" VARCHAR(120),
    "ciudad" VARCHAR(120),
    "region" VARCHAR(120),
    "email_facturacion" VARCHAR(180),
    "tipo_documento_preferido" VARCHAR(80),
    "requiere_oc" BOOLEAN NOT NULL DEFAULT false,
    "condicion_pago" VARCHAR(80),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClienteFacturacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientImportBatch" (
    "id" SERIAL NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'PREVIEW_READY',
    "total_clients" INTEGER NOT NULL DEFAULT 0,
    "ready_clients" INTEGER NOT NULL DEFAULT 0,
    "review_clients" INTEGER NOT NULL DEFAULT 0,
    "error_clients" INTEGER NOT NULL DEFAULT 0,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "ClientImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientImportItem" (
    "id" SERIAL NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "row_number" INTEGER NOT NULL,
    "source_sheet" VARCHAR(80) NOT NULL,
    "rut" VARCHAR(20),
    "nombre_razon_social" VARCHAR(200),
    "tipo_persona" VARCHAR(60),
    "estado_cliente" VARCHAR(60),
    "fecha_ingreso" DATE,
    "raw_data" JSONB NOT NULL,
    "normalized_data" JSONB,
    "status" VARCHAR(40) NOT NULL DEFAULT 'READY',
    "errors" JSONB,
    "created_cliente_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientImportItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractImportItem" (
    "id" SERIAL NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "row_number" INTEGER NOT NULL,
    "cliente_rut" VARCHAR(20),
    "servicio" VARCHAR(200),
    "area" VARCHAR(120),
    "monto_total" DECIMAL(14,2),
    "cantidad_cuotas" INTEGER,
    "fecha_inicio" DATE,
    "estado_contrato" VARCHAR(60),
    "raw_data" JSONB NOT NULL,
    "normalized_data" JSONB,
    "status" VARCHAR(40) NOT NULL DEFAULT 'READY',
    "errors" JSONB,
    "created_contrato_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractImportItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentImportItem" (
    "id" SERIAL NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "row_number" INTEGER NOT NULL,
    "contrato_ref" VARCHAR(120),
    "numero_cuota" INTEGER,
    "monto" DECIMAL(14,2),
    "fecha_vencimiento" DATE,
    "estado_cuota" VARCHAR(60),
    "raw_data" JSONB NOT NULL,
    "normalized_data" JSONB,
    "status" VARCHAR(40) NOT NULL DEFAULT 'READY',
    "errors" JSONB,
    "created_cuota_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallmentImportItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClienteContacto_cliente_id_idx" ON "ClienteContacto"("cliente_id");

-- CreateIndex
CREATE INDEX "ClienteFacturacion_cliente_id_idx" ON "ClienteFacturacion"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "ClienteFacturacion_cliente_id_rut_facturacion_key" ON "ClienteFacturacion"("cliente_id", "rut_facturacion");

-- CreateIndex
CREATE INDEX "ClientImportBatch_status_idx" ON "ClientImportBatch"("status");

-- CreateIndex
CREATE INDEX "ClientImportBatch_created_by_idx" ON "ClientImportBatch"("created_by");

-- CreateIndex
CREATE INDEX "ClientImportItem_batch_id_status_idx" ON "ClientImportItem"("batch_id", "status");

-- CreateIndex
CREATE INDEX "ClientImportItem_rut_idx" ON "ClientImportItem"("rut");

-- CreateIndex
CREATE INDEX "ContractImportItem_batch_id_status_idx" ON "ContractImportItem"("batch_id", "status");

-- CreateIndex
CREATE INDEX "ContractImportItem_cliente_rut_idx" ON "ContractImportItem"("cliente_rut");

-- CreateIndex
CREATE INDEX "InstallmentImportItem_batch_id_status_idx" ON "InstallmentImportItem"("batch_id", "status");

-- CreateIndex
CREATE INDEX "InstallmentImportItem_contrato_ref_idx" ON "InstallmentImportItem"("contrato_ref");

-- CreateIndex
CREATE UNIQUE INDEX "Contrato_cliente_id_tipo_servicio_monto_ccto_fecha_contrato_key" ON "Contrato"("cliente_id", "tipo_servicio", "monto_ccto", "fecha_contrato");

-- AddForeignKey
ALTER TABLE "ClienteContacto" ADD CONSTRAINT "ClienteContacto_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClienteFacturacion" ADD CONSTRAINT "ClienteFacturacion_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientImportBatch" ADD CONSTRAINT "ClientImportBatch_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientImportItem" ADD CONSTRAINT "ClientImportItem_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "ClientImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientImportItem" ADD CONSTRAINT "ClientImportItem_created_cliente_id_fkey" FOREIGN KEY ("created_cliente_id") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractImportItem" ADD CONSTRAINT "ContractImportItem_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "ClientImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractImportItem" ADD CONSTRAINT "ContractImportItem_created_contrato_id_fkey" FOREIGN KEY ("created_contrato_id") REFERENCES "Contrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentImportItem" ADD CONSTRAINT "InstallmentImportItem_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "ClientImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentImportItem" ADD CONSTRAINT "InstallmentImportItem_created_cuota_id_fkey" FOREIGN KEY ("created_cuota_id") REFERENCES "Cuota"("id") ON DELETE SET NULL ON UPDATE CASCADE;
