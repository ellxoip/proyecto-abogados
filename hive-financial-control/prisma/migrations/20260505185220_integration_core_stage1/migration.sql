-- CreateEnum
CREATE TYPE "ExternalEntityType" AS ENUM ('CLIENTE', 'CONTRATO', 'CASO_LEGAL', 'CUOTA', 'PAGO');

-- CreateEnum
CREATE TYPE "IntegrationEventStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExternalSyncStatus" AS ENUM ('STARTED', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "EstadoPago" AS ENUM ('REGISTRADO', 'CONFIRMADO', 'RECHAZADO', 'REVERSADO');

-- AlterTable
ALTER TABLE "Cuota" ADD COLUMN     "caso_legal_id" INTEGER;

-- AlterTable
ALTER TABLE "Pago" ADD COLUMN     "estado" "EstadoPago" NOT NULL DEFAULT 'CONFIRMADO',
ADD COLUMN     "payment_event_id" VARCHAR(120),
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "CasoLegal" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "contrato_id" INTEGER,
    "codigo_interno" VARCHAR(80),
    "titulo" VARCHAR(200) NOT NULL,
    "descripcion" TEXT,
    "estado" VARCHAR(40) NOT NULL DEFAULT 'ABIERTO',
    "fecha_apertura" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_cierre" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CasoLegal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AplicacionPago" (
    "id" SERIAL NOT NULL,
    "pago_id" INTEGER NOT NULL,
    "cuota_id" INTEGER NOT NULL,
    "monto_aplicado" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AplicacionPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SistemaExterno" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "base_url" VARCHAR(500),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SistemaExterno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalReference" (
    "id" SERIAL NOT NULL,
    "sistema_externo_id" INTEGER NOT NULL,
    "entity_type" "ExternalEntityType" NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "external_id" VARCHAR(120) NOT NULL,
    "external_secondary_id" VARCHAR(120),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationEvent" (
    "id" SERIAL NOT NULL,
    "sistema_externo_id" INTEGER NOT NULL,
    "event_type" VARCHAR(80) NOT NULL,
    "external_event_id" VARCHAR(120),
    "idempotency_key" VARCHAR(200) NOT NULL,
    "status" "IntegrationEventStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "result_payload" JSONB,
    "error_message" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalSyncLog" (
    "id" SERIAL NOT NULL,
    "sistema_externo_id" INTEGER NOT NULL,
    "sync_type" VARCHAR(80) NOT NULL,
    "status" "ExternalSyncStatus" NOT NULL DEFAULT 'STARTED',
    "request_payload" JSONB,
    "response_summary" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CasoLegal_codigo_interno_key" ON "CasoLegal"("codigo_interno");

-- CreateIndex
CREATE INDEX "CasoLegal_cliente_id_idx" ON "CasoLegal"("cliente_id");

-- CreateIndex
CREATE INDEX "CasoLegal_contrato_id_idx" ON "CasoLegal"("contrato_id");

-- CreateIndex
CREATE INDEX "CasoLegal_estado_idx" ON "CasoLegal"("estado");

-- CreateIndex
CREATE INDEX "AplicacionPago_cuota_id_idx" ON "AplicacionPago"("cuota_id");

-- CreateIndex
CREATE UNIQUE INDEX "AplicacionPago_pago_id_cuota_id_key" ON "AplicacionPago"("pago_id", "cuota_id");

-- CreateIndex
CREATE UNIQUE INDEX "SistemaExterno_codigo_key" ON "SistemaExterno"("codigo");

-- CreateIndex
CREATE INDEX "ExternalReference_entity_type_entity_id_idx" ON "ExternalReference"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalReference_sistema_externo_id_entity_type_external_i_key" ON "ExternalReference"("sistema_externo_id", "entity_type", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalReference_sistema_externo_id_entity_type_entity_id_key" ON "ExternalReference"("sistema_externo_id", "entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationEvent_idempotency_key_key" ON "IntegrationEvent"("idempotency_key");

-- CreateIndex
CREATE INDEX "IntegrationEvent_sistema_externo_id_status_idx" ON "IntegrationEvent"("sistema_externo_id", "status");

-- CreateIndex
CREATE INDEX "IntegrationEvent_created_at_idx" ON "IntegrationEvent"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationEvent_sistema_externo_id_event_type_external_eve_key" ON "IntegrationEvent"("sistema_externo_id", "event_type", "external_event_id");

-- CreateIndex
CREATE INDEX "ExternalSyncLog_sistema_externo_id_status_idx" ON "ExternalSyncLog"("sistema_externo_id", "status");

-- CreateIndex
CREATE INDEX "ExternalSyncLog_started_at_idx" ON "ExternalSyncLog"("started_at");

-- CreateIndex
CREATE INDEX "Cuota_caso_legal_id_idx" ON "Cuota"("caso_legal_id");

-- CreateIndex
CREATE INDEX "Pago_estado_idx" ON "Pago"("estado");

-- CreateIndex
CREATE INDEX "Pago_payment_event_id_idx" ON "Pago"("payment_event_id");

-- AddForeignKey
ALTER TABLE "Cuota" ADD CONSTRAINT "Cuota_caso_legal_id_fkey" FOREIGN KEY ("caso_legal_id") REFERENCES "CasoLegal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CasoLegal" ADD CONSTRAINT "CasoLegal_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CasoLegal" ADD CONSTRAINT "CasoLegal_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "Contrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionPago" ADD CONSTRAINT "AplicacionPago_pago_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "Pago"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionPago" ADD CONSTRAINT "AplicacionPago_cuota_id_fkey" FOREIGN KEY ("cuota_id") REFERENCES "Cuota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalReference" ADD CONSTRAINT "ExternalReference_sistema_externo_id_fkey" FOREIGN KEY ("sistema_externo_id") REFERENCES "SistemaExterno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationEvent" ADD CONSTRAINT "IntegrationEvent_sistema_externo_id_fkey" FOREIGN KEY ("sistema_externo_id") REFERENCES "SistemaExterno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalSyncLog" ADD CONSTRAINT "ExternalSyncLog_sistema_externo_id_fkey" FOREIGN KEY ("sistema_externo_id") REFERENCES "SistemaExterno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
