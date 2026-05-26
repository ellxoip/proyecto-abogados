-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('ADMIN', 'CONTADOR');

-- CreateEnum
CREATE TYPE "TipoCliente" AS ENUM ('PERSONA', 'EMPRESA');

-- CreateEnum
CREATE TYPE "EstadoCliente" AS ENUM ('ACTIVO', 'AL_DIA', 'MOROSO', 'FINALIZADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "EstadoContrato" AS ENUM ('ACTIVO', 'PAGADO', 'EN_MORA', 'REPACTADO', 'TERMINADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "EstadoCuota" AS ENUM ('PENDIENTE', 'PAGADA', 'PARCIAL', 'VENCIDA', 'REPROGRAMADA', 'REEMPLAZADA', 'ANULADA', 'CONDONADA');

-- CreateEnum
CREATE TYPE "TipoModificacion" AS ENUM ('CAMBIO_FECHA', 'REPACTACION', 'CAMBIO_MONTO', 'ANULACION', 'CONDONACION', 'EDICION_PAGO');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "email" VARCHAR(180) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "rol" "RolUsuario" NOT NULL DEFAULT 'CONTADOR',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" SERIAL NOT NULL,
    "rut" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "tipo_cliente" "TipoCliente" NOT NULL,
    "telefono" VARCHAR(30),
    "email" VARCHAR(180),
    "fecha_ingreso" DATE NOT NULL,
    "estado" "EstadoCliente" NOT NULL DEFAULT 'ACTIVO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contrato" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "external_id" VARCHAR(80),
    "tipo_servicio" VARCHAR(200) NOT NULL,
    "fecha_contrato" DATE NOT NULL,
    "monto_ccto" DECIMAL(14,2) NOT NULL,
    "monto_pago_inicial" DECIMAL(14,2) NOT NULL,
    "saldo_financiado" DECIMAL(14,2) NOT NULL,
    "cantidad_cuotas_original" INTEGER NOT NULL,
    "estado" "EstadoContrato" NOT NULL DEFAULT 'ACTIVO',
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cuota" (
    "id" SERIAL NOT NULL,
    "contrato_id" INTEGER NOT NULL,
    "numero_cuota" INTEGER NOT NULL,
    "fecha_vencimiento" DATE NOT NULL,
    "monto_original" DECIMAL(14,2) NOT NULL,
    "monto_actual" DECIMAL(14,2) NOT NULL,
    "monto_pagado" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "saldo_pendiente" DECIMAL(14,2) NOT NULL,
    "estado" "EstadoCuota" NOT NULL DEFAULT 'PENDIENTE',
    "fecha_pago" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "contrato_id" INTEGER NOT NULL,
    "cuota_id" INTEGER,
    "fecha_pago" DATE NOT NULL,
    "monto_pagado" DECIMAL(14,2) NOT NULL,
    "medio_pago" VARCHAR(60) NOT NULL,
    "referencia" VARCHAR(120),
    "comprobante_url" VARCHAR(500),
    "observacion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModificacionContrato" (
    "id" SERIAL NOT NULL,
    "contrato_id" INTEGER NOT NULL,
    "cuota_id" INTEGER,
    "usuario_id" INTEGER NOT NULL,
    "tipo_modificacion" "TipoModificacion" NOT NULL,
    "fecha_modificacion" DATE NOT NULL,
    "valor_anterior" JSONB NOT NULL,
    "valor_nuevo" JSONB NOT NULL,
    "motivo" TEXT NOT NULL,
    "aprobado_por" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModificacionContrato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_rut_key" ON "Cliente"("rut");

-- CreateIndex
CREATE UNIQUE INDEX "Contrato_external_id_key" ON "Contrato"("external_id");

-- CreateIndex
CREATE INDEX "Contrato_cliente_id_idx" ON "Contrato"("cliente_id");

-- CreateIndex
CREATE INDEX "Contrato_estado_idx" ON "Contrato"("estado");

-- CreateIndex
CREATE INDEX "Cuota_contrato_id_estado_idx" ON "Cuota"("contrato_id", "estado");

-- CreateIndex
CREATE INDEX "Cuota_fecha_vencimiento_idx" ON "Cuota"("fecha_vencimiento");

-- CreateIndex
CREATE UNIQUE INDEX "Cuota_contrato_id_numero_cuota_key" ON "Cuota"("contrato_id", "numero_cuota");

-- CreateIndex
CREATE INDEX "Pago_cliente_id_fecha_pago_idx" ON "Pago"("cliente_id", "fecha_pago");

-- CreateIndex
CREATE INDEX "Pago_contrato_id_fecha_pago_idx" ON "Pago"("contrato_id", "fecha_pago");

-- CreateIndex
CREATE INDEX "Pago_cuota_id_idx" ON "Pago"("cuota_id");

-- CreateIndex
CREATE INDEX "ModificacionContrato_contrato_id_fecha_modificacion_idx" ON "ModificacionContrato"("contrato_id", "fecha_modificacion");

-- CreateIndex
CREATE INDEX "ModificacionContrato_usuario_id_idx" ON "ModificacionContrato"("usuario_id");

-- CreateIndex
CREATE INDEX "ModificacionContrato_aprobado_por_idx" ON "ModificacionContrato"("aprobado_por");

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cuota" ADD CONSTRAINT "Cuota_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_cuota_id_fkey" FOREIGN KEY ("cuota_id") REFERENCES "Cuota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModificacionContrato" ADD CONSTRAINT "ModificacionContrato_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModificacionContrato" ADD CONSTRAINT "ModificacionContrato_cuota_id_fkey" FOREIGN KEY ("cuota_id") REFERENCES "Cuota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModificacionContrato" ADD CONSTRAINT "ModificacionContrato_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModificacionContrato" ADD CONSTRAINT "ModificacionContrato_aprobado_por_fkey" FOREIGN KEY ("aprobado_por") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

