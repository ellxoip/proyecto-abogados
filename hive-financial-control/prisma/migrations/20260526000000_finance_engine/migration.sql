-- CreateEnum
CREATE TYPE "TipoCuentaBancaria" AS ENUM ('CORRIENTE', 'AHORRO', 'VISTA', 'CREDITO');

-- CreateEnum
CREATE TYPE "TipoMovimientoTesoreria" AS ENUM ('INGRESO', 'EGRESO');

-- CreateEnum
CREATE TYPE "EstadoEgreso" AS ENUM ('PENDIENTE', 'APROBADO', 'PAGADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "EstadoConciliacion" AS ENUM ('EN_PROCESO', 'CONCILIADO', 'CON_DIFERENCIAS');

-- CreateEnum
CREATE TYPE "EstadoRendicion" AS ENUM ('BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "EstadoReposicion" AS ENUM ('PENDIENTE', 'APROBADA', 'PAGADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "TipoDocumentoVenta" AS ENUM ('BOLETA', 'FACTURA_EXENTA', 'FACTURA_AFECTA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'COMPROBANTE_INGRESO');

-- CreateEnum
CREATE TYPE "EstadoDocVenta" AS ENUM ('EMITIDO', 'ACEPTADO_SII', 'RECLAMADO', 'ANULADO', 'PAGADO');

-- CreateEnum
CREATE TYPE "TipoDocumentoCompra" AS ENUM ('FACTURA', 'BOLETA', 'NOTA_CREDITO_RECIBIDA', 'NOTA_DEBITO_RECIBIDA');

-- CreateEnum
CREATE TYPE "EstadoDocCompra" AS ENUM ('RECIBIDO', 'VALIDADO', 'ACEPTADO', 'RECLAMADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "EstadoPagoGasto" AS ENUM ('PENDIENTE', 'APROBADO', 'PAGADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "EstadoCxP" AS ENUM ('PENDIENTE', 'PAGADA', 'VENCIDA', 'ANULADA');

-- CreateEnum
CREATE TYPE "TipoCuentaContable" AS ENUM ('ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'GASTO', 'COSTO');

-- CreateEnum
CREATE TYPE "NaturalezaCuenta" AS ENUM ('DEUDORA', 'ACREEDORA');

-- CreateEnum
CREATE TYPE "TipoMovimientoContable" AS ENUM ('DEBE', 'HABER');

-- CreateEnum
CREATE TYPE "EstadoComprobante" AS ENUM ('BORRADOR', 'APROBADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "TipoCierre" AS ENUM ('MENSUAL', 'ANUAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RolUsuario" ADD VALUE 'ANALISTA';
ALTER TYPE "RolUsuario" ADD VALUE 'SOLO_LECTURA';

-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "empresa_id" INTEGER;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "empresa_id" INTEGER;

-- CreateTable
CREATE TABLE "Empresa" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "rut" VARCHAR(20) NOT NULL,
    "razon_social" VARCHAR(200) NOT NULL,
    "giro" VARCHAR(200),
    "direccion" VARCHAR(255),
    "telefono" VARCHAR(30),
    "email" VARCHAR(180),
    "logo_url" VARCHAR(500),
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Banco" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER,
    "nombre" VARCHAR(120) NOT NULL,
    "codigo_banco" VARCHAR(20),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Banco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuentaBancaria" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER,
    "banco_id" INTEGER NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "numero_cuenta" VARCHAR(40) NOT NULL,
    "tipo_cuenta" "TipoCuentaBancaria" NOT NULL,
    "moneda" VARCHAR(10) NOT NULL DEFAULT 'CLP',
    "saldo_inicial" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "cuenta_principal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuentaBancaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoTesoreria" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER,
    "cuenta_id" INTEGER NOT NULL,
    "tipo" "TipoMovimientoTesoreria" NOT NULL,
    "categoria" VARCHAR(120),
    "descripcion" VARCHAR(300) NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "fecha_movimiento" DATE NOT NULL,
    "referencia" VARCHAR(120),
    "comprobante_url" VARCHAR(500),
    "conciliado" BOOLEAN NOT NULL DEFAULT false,
    "pago_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MovimientoTesoreria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EgresoTesoreria" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER,
    "cuenta_id" INTEGER NOT NULL,
    "proveedor_id" INTEGER,
    "categoria" VARCHAR(120) NOT NULL,
    "descripcion" VARCHAR(300) NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "fecha_egreso" DATE NOT NULL,
    "fecha_vencimiento" DATE,
    "estado" "EstadoEgreso" NOT NULL DEFAULT 'PENDIENTE',
    "referencia" VARCHAR(120),
    "comprobante_url" VARCHAR(500),
    "recurrente" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EgresoTesoreria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConciliacionBancaria" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER,
    "cuenta_id" INTEGER NOT NULL,
    "periodo" VARCHAR(7) NOT NULL,
    "estado" "EstadoConciliacion" NOT NULL DEFAULT 'EN_PROCESO',
    "saldo_banco" DECIMAL(14,2) NOT NULL,
    "saldo_sistema" DECIMAL(14,2) NOT NULL,
    "diferencia" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConciliacionBancaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemConciliacion" (
    "id" SERIAL NOT NULL,
    "conciliacion_id" INTEGER NOT NULL,
    "fecha_movimiento" DATE NOT NULL,
    "glosa" VARCHAR(300) NOT NULL,
    "cargo" DECIMAL(14,2),
    "abono" DECIMAL(14,2),
    "conciliado" BOOLEAN NOT NULL DEFAULT false,
    "movimiento_sistema_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemConciliacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FondoCajaChica" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER,
    "nombre" VARCHAR(120) NOT NULL,
    "monto_asignado" DECIMAL(14,2) NOT NULL,
    "saldo_actual" DECIMAL(14,2) NOT NULL,
    "responsable_id" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "monto_max_gasto" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FondoCajaChica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GastoCajaChica" (
    "id" SERIAL NOT NULL,
    "fondo_id" INTEGER NOT NULL,
    "empresa_id" INTEGER,
    "categoria" VARCHAR(120) NOT NULL,
    "descripcion" VARCHAR(300) NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "fecha_gasto" DATE NOT NULL,
    "responsable_id" INTEGER NOT NULL,
    "comprobante_url" VARCHAR(500),
    "rendicion_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GastoCajaChica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RendicionCajaChica" (
    "id" SERIAL NOT NULL,
    "fondo_id" INTEGER NOT NULL,
    "empresa_id" INTEGER,
    "periodo" VARCHAR(20) NOT NULL,
    "total_gastos" DECIMAL(14,2) NOT NULL,
    "estado" "EstadoRendicion" NOT NULL DEFAULT 'BORRADOR',
    "aprobado_por" INTEGER,
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RendicionCajaChica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReposicionCajaChica" (
    "id" SERIAL NOT NULL,
    "rendicion_id" INTEGER NOT NULL,
    "empresa_id" INTEGER,
    "monto" DECIMAL(14,2) NOT NULL,
    "estado" "EstadoReposicion" NOT NULL DEFAULT 'PENDIENTE',
    "aprobado_por" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReposicionCajaChica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Servicio" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER,
    "nombre" VARCHAR(200) NOT NULL,
    "descripcion" TEXT,
    "precio_ref" DECIMAL(14,2),
    "tipo_impuesto" VARCHAR(40) NOT NULL DEFAULT 'EXENTO',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Servicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoVenta" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER,
    "tipo" "TipoDocumentoVenta" NOT NULL,
    "numero" INTEGER,
    "cliente_id" INTEGER,
    "razon_social" VARCHAR(200) NOT NULL,
    "rut_receptor" VARCHAR(20),
    "fecha_emision" DATE NOT NULL,
    "fecha_vencimiento" DATE,
    "monto_neto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "iva" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "monto_total" DECIMAL(14,2) NOT NULL,
    "estado" "EstadoDocVenta" NOT NULL DEFAULT 'EMITIDO',
    "estado_sii" VARCHAR(40),
    "servicio_id" INTEGER,
    "observaciones" TEXT,
    "regla_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentoVenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineaDocumentoVenta" (
    "id" SERIAL NOT NULL,
    "documento_id" INTEGER NOT NULL,
    "descripcion" VARCHAR(300) NOT NULL,
    "cantidad" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "precio_unitario" DECIMAL(14,2) NOT NULL,
    "descuento" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineaDocumentoVenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotaCredito" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER,
    "documento_origen_id" INTEGER NOT NULL,
    "numero" INTEGER,
    "monto" DECIMAL(14,2) NOT NULL,
    "motivo" VARCHAR(300) NOT NULL,
    "fecha_emision" DATE NOT NULL,
    "estado" "EstadoDocVenta" NOT NULL DEFAULT 'EMITIDO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotaCredito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReglaFacturacion" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER,
    "cliente_id" INTEGER NOT NULL,
    "servicio_id" INTEGER,
    "nombre" VARCHAR(200) NOT NULL,
    "periodicidad" VARCHAR(40) NOT NULL,
    "dia_emision" INTEGER NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "tipo_ejecucion" VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReglaFacturacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proveedor" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER,
    "rut" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "razon_social" VARCHAR(200),
    "giro" VARCHAR(200),
    "direccion" VARCHAR(255),
    "telefono" VARCHAR(30),
    "email" VARCHAR(180),
    "banco" VARCHAR(120),
    "numero_cuenta" VARCHAR(40),
    "tipo_cuenta_pago" VARCHAR(40),
    "categoria" VARCHAR(120),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GastoCompra" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER,
    "proveedor_id" INTEGER,
    "categoria" VARCHAR(120) NOT NULL,
    "descripcion" VARCHAR(300) NOT NULL,
    "monto_neto" DECIMAL(14,2) NOT NULL,
    "iva" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "monto_total" DECIMAL(14,2) NOT NULL,
    "fecha_gasto" DATE NOT NULL,
    "estado_pago" "EstadoPagoGasto" NOT NULL DEFAULT 'PENDIENTE',
    "comprobante_url" VARCHAR(500),
    "aprobado" BOOLEAN NOT NULL DEFAULT false,
    "cuenta_contable" VARCHAR(40),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GastoCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoCompra" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER,
    "proveedor_id" INTEGER NOT NULL,
    "tipo" "TipoDocumentoCompra" NOT NULL,
    "numero" VARCHAR(40),
    "fecha_emision" DATE NOT NULL,
    "fecha_vencimiento" DATE,
    "monto_neto" DECIMAL(14,2) NOT NULL,
    "iva" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "monto_total" DECIMAL(14,2) NOT NULL,
    "estado" "EstadoDocCompra" NOT NULL DEFAULT 'RECIBIDO',
    "reclamado" BOOLEAN NOT NULL DEFAULT false,
    "motivo_reclamo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentoCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineaDocumentoCompra" (
    "id" SERIAL NOT NULL,
    "documento_id" INTEGER NOT NULL,
    "descripcion" VARCHAR(300) NOT NULL,
    "cantidad" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "precio_unitario" DECIMAL(14,2) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineaDocumentoCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HonorarioRecibido" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER,
    "proveedor_id" INTEGER NOT NULL,
    "monto_bruto" DECIMAL(14,2) NOT NULL,
    "tasa_retencion" DECIMAL(5,4) NOT NULL DEFAULT 0.1075,
    "monto_retencion" DECIMAL(14,2) NOT NULL,
    "monto_neto" DECIMAL(14,2) NOT NULL,
    "fecha_emision" DATE NOT NULL,
    "periodo_tributario" VARCHAR(7),
    "pagado" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HonorarioRecibido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuentaPorPagar" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER,
    "proveedor_id" INTEGER NOT NULL,
    "documento_id" INTEGER,
    "monto" DECIMAL(14,2) NOT NULL,
    "fecha_vencimiento" DATE NOT NULL,
    "estado" "EstadoCxP" NOT NULL DEFAULT 'PENDIENTE',
    "fecha_pago" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuentaPorPagar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuentaContable" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "tipo" "TipoCuentaContable" NOT NULL,
    "naturaleza" "NaturalezaCuenta" NOT NULL,
    "nivel" INTEGER NOT NULL DEFAULT 1,
    "cuenta_padre_id" INTEGER,
    "acepta_movimientos" BOOLEAN NOT NULL DEFAULT true,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuentaContable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TipoComprobanteContable" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER,
    "nombre" VARCHAR(120) NOT NULL,
    "descripcion" TEXT,
    "prefijo" VARCHAR(10),
    "siguiente_numero" INTEGER NOT NULL DEFAULT 1,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TipoComprobanteContable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComprobanteContable" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER,
    "tipo_id" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "fecha_comprobante" DATE NOT NULL,
    "descripcion" VARCHAR(300) NOT NULL,
    "estado" "EstadoComprobante" NOT NULL DEFAULT 'BORRADOR',
    "total_debe" DECIMAL(14,2) NOT NULL,
    "total_haber" DECIMAL(14,2) NOT NULL,
    "usuario_id" INTEGER,
    "aprobado_por" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComprobanteContable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartidaContable" (
    "id" SERIAL NOT NULL,
    "comprobante_id" INTEGER NOT NULL,
    "cuenta_id" INTEGER NOT NULL,
    "tipo" "TipoMovimientoContable" NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "glosa" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartidaContable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CierreContable" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER,
    "tipo" "TipoCierre" NOT NULL,
    "periodo" VARCHAR(7) NOT NULL,
    "fecha_cierre" DATE NOT NULL,
    "usuario_id" INTEGER,
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CierreContable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigEmpresa" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER,
    "razon_social" VARCHAR(200),
    "rut" VARCHAR(20),
    "giro" VARCHAR(200),
    "direccion" VARCHAR(255),
    "telefono" VARCHAR(30),
    "email" VARCHAR(180),
    "logo_url" VARCHAR(500),
    "anio_fiscal" INTEGER,
    "moneda_base" VARCHAR(10) NOT NULL DEFAULT 'CLP',
    "zona_horaria" VARCHAR(60) NOT NULL DEFAULT 'America/Santiago',
    "dias_gracia_mora" INTEGER NOT NULL DEFAULT 0,
    "tasa_interes_mora" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "formato_fecha" VARCHAR(20) NOT NULL DEFAULT 'dd/MM/yyyy',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigEmpresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Impuesto" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER,
    "nombre" VARCHAR(120) NOT NULL,
    "tasa" DECIMAL(5,4) NOT NULL,
    "tipo" VARCHAR(40) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Impuesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CondicionPago" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER,
    "nombre" VARCHAR(120) NOT NULL,
    "dias_plazo" INTEGER NOT NULL DEFAULT 0,
    "descripcion" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CondicionPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TipoDocumentoTributario" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER,
    "nombre" VARCHAR(120) NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "folio_inicial" INTEGER NOT NULL DEFAULT 1,
    "siguiente_folio" INTEGER NOT NULL DEFAULT 1,
    "cuenta_contable" VARCHAR(40),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TipoDocumentoTributario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoriaGasto" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER,
    "nombre" VARCHAR(120) NOT NULL,
    "cuenta_contable" VARCHAR(40),
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoriaGasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TipoMovimientoConfig" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER,
    "nombre" VARCHAR(120) NOT NULL,
    "naturaleza" VARCHAR(10) NOT NULL,
    "cuenta_contable" VARCHAR(40),
    "recurrente" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TipoMovimientoConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_rut_key" ON "Empresa"("rut");

-- CreateIndex
CREATE INDEX "Banco_empresa_id_idx" ON "Banco"("empresa_id");

-- CreateIndex
CREATE INDEX "CuentaBancaria_empresa_id_idx" ON "CuentaBancaria"("empresa_id");

-- CreateIndex
CREATE INDEX "MovimientoTesoreria_empresa_id_idx" ON "MovimientoTesoreria"("empresa_id");

-- CreateIndex
CREATE INDEX "MovimientoTesoreria_cuenta_id_idx" ON "MovimientoTesoreria"("cuenta_id");

-- CreateIndex
CREATE INDEX "MovimientoTesoreria_fecha_movimiento_idx" ON "MovimientoTesoreria"("fecha_movimiento");

-- CreateIndex
CREATE INDEX "EgresoTesoreria_empresa_id_idx" ON "EgresoTesoreria"("empresa_id");

-- CreateIndex
CREATE INDEX "EgresoTesoreria_cuenta_id_idx" ON "EgresoTesoreria"("cuenta_id");

-- CreateIndex
CREATE INDEX "EgresoTesoreria_estado_idx" ON "EgresoTesoreria"("estado");

-- CreateIndex
CREATE INDEX "ConciliacionBancaria_empresa_id_idx" ON "ConciliacionBancaria"("empresa_id");

-- CreateIndex
CREATE INDEX "ConciliacionBancaria_cuenta_id_periodo_idx" ON "ConciliacionBancaria"("cuenta_id", "periodo");

-- CreateIndex
CREATE INDEX "ItemConciliacion_conciliacion_id_idx" ON "ItemConciliacion"("conciliacion_id");

-- CreateIndex
CREATE INDEX "FondoCajaChica_empresa_id_idx" ON "FondoCajaChica"("empresa_id");

-- CreateIndex
CREATE INDEX "GastoCajaChica_fondo_id_idx" ON "GastoCajaChica"("fondo_id");

-- CreateIndex
CREATE INDEX "GastoCajaChica_rendicion_id_idx" ON "GastoCajaChica"("rendicion_id");

-- CreateIndex
CREATE INDEX "RendicionCajaChica_fondo_id_idx" ON "RendicionCajaChica"("fondo_id");

-- CreateIndex
CREATE UNIQUE INDEX "ReposicionCajaChica_rendicion_id_key" ON "ReposicionCajaChica"("rendicion_id");

-- CreateIndex
CREATE INDEX "Servicio_empresa_id_idx" ON "Servicio"("empresa_id");

-- CreateIndex
CREATE INDEX "DocumentoVenta_empresa_id_idx" ON "DocumentoVenta"("empresa_id");

-- CreateIndex
CREATE INDEX "DocumentoVenta_cliente_id_idx" ON "DocumentoVenta"("cliente_id");

-- CreateIndex
CREATE INDEX "DocumentoVenta_tipo_estado_idx" ON "DocumentoVenta"("tipo", "estado");

-- CreateIndex
CREATE INDEX "LineaDocumentoVenta_documento_id_idx" ON "LineaDocumentoVenta"("documento_id");

-- CreateIndex
CREATE INDEX "NotaCredito_documento_origen_id_idx" ON "NotaCredito"("documento_origen_id");

-- CreateIndex
CREATE INDEX "ReglaFacturacion_empresa_id_idx" ON "ReglaFacturacion"("empresa_id");

-- CreateIndex
CREATE INDEX "ReglaFacturacion_cliente_id_idx" ON "ReglaFacturacion"("cliente_id");

-- CreateIndex
CREATE INDEX "Proveedor_empresa_id_idx" ON "Proveedor"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "Proveedor_empresa_id_rut_key" ON "Proveedor"("empresa_id", "rut");

-- CreateIndex
CREATE INDEX "GastoCompra_empresa_id_idx" ON "GastoCompra"("empresa_id");

-- CreateIndex
CREATE INDEX "GastoCompra_proveedor_id_idx" ON "GastoCompra"("proveedor_id");

-- CreateIndex
CREATE INDEX "GastoCompra_estado_pago_idx" ON "GastoCompra"("estado_pago");

-- CreateIndex
CREATE INDEX "DocumentoCompra_empresa_id_idx" ON "DocumentoCompra"("empresa_id");

-- CreateIndex
CREATE INDEX "DocumentoCompra_proveedor_id_idx" ON "DocumentoCompra"("proveedor_id");

-- CreateIndex
CREATE INDEX "DocumentoCompra_estado_idx" ON "DocumentoCompra"("estado");

-- CreateIndex
CREATE INDEX "LineaDocumentoCompra_documento_id_idx" ON "LineaDocumentoCompra"("documento_id");

-- CreateIndex
CREATE INDEX "HonorarioRecibido_empresa_id_idx" ON "HonorarioRecibido"("empresa_id");

-- CreateIndex
CREATE INDEX "HonorarioRecibido_proveedor_id_idx" ON "HonorarioRecibido"("proveedor_id");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaPorPagar_documento_id_key" ON "CuentaPorPagar"("documento_id");

-- CreateIndex
CREATE INDEX "CuentaPorPagar_empresa_id_idx" ON "CuentaPorPagar"("empresa_id");

-- CreateIndex
CREATE INDEX "CuentaPorPagar_proveedor_id_idx" ON "CuentaPorPagar"("proveedor_id");

-- CreateIndex
CREATE INDEX "CuentaPorPagar_estado_fecha_vencimiento_idx" ON "CuentaPorPagar"("estado", "fecha_vencimiento");

-- CreateIndex
CREATE INDEX "CuentaContable_empresa_id_idx" ON "CuentaContable"("empresa_id");

-- CreateIndex
CREATE INDEX "CuentaContable_tipo_idx" ON "CuentaContable"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaContable_empresa_id_codigo_key" ON "CuentaContable"("empresa_id", "codigo");

-- CreateIndex
CREATE INDEX "TipoComprobanteContable_empresa_id_idx" ON "TipoComprobanteContable"("empresa_id");

-- CreateIndex
CREATE INDEX "ComprobanteContable_empresa_id_idx" ON "ComprobanteContable"("empresa_id");

-- CreateIndex
CREATE INDEX "ComprobanteContable_tipo_id_numero_idx" ON "ComprobanteContable"("tipo_id", "numero");

-- CreateIndex
CREATE INDEX "ComprobanteContable_estado_idx" ON "ComprobanteContable"("estado");

-- CreateIndex
CREATE INDEX "ComprobanteContable_fecha_comprobante_idx" ON "ComprobanteContable"("fecha_comprobante");

-- CreateIndex
CREATE INDEX "PartidaContable_comprobante_id_idx" ON "PartidaContable"("comprobante_id");

-- CreateIndex
CREATE INDEX "PartidaContable_cuenta_id_idx" ON "PartidaContable"("cuenta_id");

-- CreateIndex
CREATE INDEX "CierreContable_empresa_id_idx" ON "CierreContable"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "CierreContable_empresa_id_tipo_periodo_key" ON "CierreContable"("empresa_id", "tipo", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigEmpresa_empresa_id_key" ON "ConfigEmpresa"("empresa_id");

-- CreateIndex
CREATE INDEX "Impuesto_empresa_id_idx" ON "Impuesto"("empresa_id");

-- CreateIndex
CREATE INDEX "CondicionPago_empresa_id_idx" ON "CondicionPago"("empresa_id");

-- CreateIndex
CREATE INDEX "TipoDocumentoTributario_empresa_id_idx" ON "TipoDocumentoTributario"("empresa_id");

-- CreateIndex
CREATE INDEX "CategoriaGasto_empresa_id_idx" ON "CategoriaGasto"("empresa_id");

-- CreateIndex
CREATE INDEX "TipoMovimientoConfig_empresa_id_idx" ON "TipoMovimientoConfig"("empresa_id");

-- CreateIndex
CREATE INDEX "Cliente_empresa_id_idx" ON "Cliente"("empresa_id");

-- AddForeignKey
ALTER TABLE "CuentaBancaria" ADD CONSTRAINT "CuentaBancaria_banco_id_fkey" FOREIGN KEY ("banco_id") REFERENCES "Banco"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoTesoreria" ADD CONSTRAINT "MovimientoTesoreria_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "CuentaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EgresoTesoreria" ADD CONSTRAINT "EgresoTesoreria_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "CuentaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EgresoTesoreria" ADD CONSTRAINT "EgresoTesoreria_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConciliacionBancaria" ADD CONSTRAINT "ConciliacionBancaria_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "CuentaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemConciliacion" ADD CONSTRAINT "ItemConciliacion_conciliacion_id_fkey" FOREIGN KEY ("conciliacion_id") REFERENCES "ConciliacionBancaria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FondoCajaChica" ADD CONSTRAINT "FondoCajaChica_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GastoCajaChica" ADD CONSTRAINT "GastoCajaChica_fondo_id_fkey" FOREIGN KEY ("fondo_id") REFERENCES "FondoCajaChica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GastoCajaChica" ADD CONSTRAINT "GastoCajaChica_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GastoCajaChica" ADD CONSTRAINT "GastoCajaChica_rendicion_id_fkey" FOREIGN KEY ("rendicion_id") REFERENCES "RendicionCajaChica"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RendicionCajaChica" ADD CONSTRAINT "RendicionCajaChica_fondo_id_fkey" FOREIGN KEY ("fondo_id") REFERENCES "FondoCajaChica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RendicionCajaChica" ADD CONSTRAINT "RendicionCajaChica_aprobado_por_fkey" FOREIGN KEY ("aprobado_por") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReposicionCajaChica" ADD CONSTRAINT "ReposicionCajaChica_rendicion_id_fkey" FOREIGN KEY ("rendicion_id") REFERENCES "RendicionCajaChica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReposicionCajaChica" ADD CONSTRAINT "ReposicionCajaChica_aprobado_por_fkey" FOREIGN KEY ("aprobado_por") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoVenta" ADD CONSTRAINT "DocumentoVenta_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoVenta" ADD CONSTRAINT "DocumentoVenta_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "Servicio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineaDocumentoVenta" ADD CONSTRAINT "LineaDocumentoVenta_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "DocumentoVenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaCredito" ADD CONSTRAINT "NotaCredito_documento_origen_id_fkey" FOREIGN KEY ("documento_origen_id") REFERENCES "DocumentoVenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaFacturacion" ADD CONSTRAINT "ReglaFacturacion_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaFacturacion" ADD CONSTRAINT "ReglaFacturacion_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "Servicio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GastoCompra" ADD CONSTRAINT "GastoCompra_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoCompra" ADD CONSTRAINT "DocumentoCompra_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineaDocumentoCompra" ADD CONSTRAINT "LineaDocumentoCompra_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "DocumentoCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HonorarioRecibido" ADD CONSTRAINT "HonorarioRecibido_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaPorPagar" ADD CONSTRAINT "CuentaPorPagar_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaPorPagar" ADD CONSTRAINT "CuentaPorPagar_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "DocumentoCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaContable" ADD CONSTRAINT "CuentaContable_cuenta_padre_id_fkey" FOREIGN KEY ("cuenta_padre_id") REFERENCES "CuentaContable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComprobanteContable" ADD CONSTRAINT "ComprobanteContable_tipo_id_fkey" FOREIGN KEY ("tipo_id") REFERENCES "TipoComprobanteContable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComprobanteContable" ADD CONSTRAINT "ComprobanteContable_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComprobanteContable" ADD CONSTRAINT "ComprobanteContable_aprobado_por_fkey" FOREIGN KEY ("aprobado_por") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartidaContable" ADD CONSTRAINT "PartidaContable_comprobante_id_fkey" FOREIGN KEY ("comprobante_id") REFERENCES "ComprobanteContable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartidaContable" ADD CONSTRAINT "PartidaContable_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "CuentaContable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CierreContable" ADD CONSTRAINT "CierreContable_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

