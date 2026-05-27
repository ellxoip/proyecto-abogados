import {
  EstadoCuota,
  NaturalezaCuenta,
  PrismaClient,
  RolUsuario,
  TipoCuentaContable,
  TipoCliente,
  TipoModificacion,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  await prisma.externalSyncLog.deleteMany();
  await prisma.modificacionContrato.deleteMany();
  await prisma.pago.deleteMany();
  await prisma.cuota.deleteMany();
  await prisma.contrato.deleteMany();
  await prisma.cliente.deleteMany();
  await prisma.usuario.deleteMany();

  const adminPassword = await bcrypt.hash("Admin123!", 10);
  const contadorPassword = await bcrypt.hash("Contador123!", 10);

  const admin = await prisma.usuario.create({
    data: {
      nombre: "Administrador General",
      email: "admin@legalfinance.local",
      password_hash: adminPassword,
      rol: RolUsuario.ADMIN,
    },
  });

  const contador = await prisma.usuario.create({
    data: {
      nombre: "Contador Principal",
      email: "contador@legalfinance.local",
      password_hash: contadorPassword,
      rol: RolUsuario.CONTADOR,
    },
  });

  const cliente = await prisma.cliente.create({
    data: {
      rut: "12345678-9",
      nombre: "Juan Perez",
      tipo_cliente: TipoCliente.PERSONA,
      telefono: "+56912345678",
      email: "juan@email.com",
      fecha_ingreso: new Date("2026-04-30"),
    },
  });

  const contrato = await prisma.contrato.create({
    data: {
      cliente_id: cliente.id,
      external_id: "KOMMO-12345",
      tipo_servicio: "Convenio de pago TGR",
      fecha_contrato: new Date("2026-04-30"),
      monto_ccto: "1000000.00",
      monto_pago_inicial: "500000.00",
      saldo_financiado: "500000.00",
      cantidad_cuotas_original: 5,
      cuotas: {
        create: [
          {
            numero_cuota: 1,
            fecha_vencimiento: new Date("2026-05-05"),
            monto_original: "100000.00",
            monto_actual: "100000.00",
            monto_pagado: "100000.00",
            saldo_pendiente: "0.00",
            estado: EstadoCuota.PAGADA,
            fecha_pago: new Date("2026-05-05"),
          },
          {
            numero_cuota: 2,
            fecha_vencimiento: new Date("2026-06-05"),
            monto_original: "100000.00",
            monto_actual: "100000.00",
            monto_pagado: "0.00",
            saldo_pendiente: "100000.00",
          },
          {
            numero_cuota: 3,
            fecha_vencimiento: new Date("2026-07-05"),
            monto_original: "100000.00",
            monto_actual: "100000.00",
            monto_pagado: "0.00",
            saldo_pendiente: "100000.00",
          },
          {
            numero_cuota: 4,
            fecha_vencimiento: new Date("2026-08-05"),
            monto_original: "100000.00",
            monto_actual: "100000.00",
            monto_pagado: "0.00",
            saldo_pendiente: "100000.00",
          },
          {
            numero_cuota: 5,
            fecha_vencimiento: new Date("2026-09-05"),
            monto_original: "100000.00",
            monto_actual: "100000.00",
            monto_pagado: "0.00",
            saldo_pendiente: "100000.00",
          },
        ],
      },
    },
    include: {
      cuotas: true,
    },
  });

  await prisma.pago.createMany({
    data: [
      {
        cliente_id: cliente.id,
        contrato_id: contrato.id,
        fecha_pago: new Date("2026-04-30"),
        monto_pagado: "500000.00",
        medio_pago: "transferencia",
        referencia: "PI-0001",
        observacion: "Pago inicial",
      },
      {
        cliente_id: cliente.id,
        contrato_id: contrato.id,
        cuota_id: contrato.cuotas[0].id,
        fecha_pago: new Date("2026-05-05"),
        monto_pagado: "100000.00",
        medio_pago: "transferencia",
        referencia: "CUOTA-1",
      },
    ],
  });

  await prisma.modificacionContrato.create({
    data: {
      contrato_id: contrato.id,
      cuota_id: contrato.cuotas[1].id,
      usuario_id: contador.id,
      aprobado_por: admin.id,
      tipo_modificacion: TipoModificacion.CAMBIO_FECHA,
      fecha_modificacion: new Date("2026-05-20"),
      valor_anterior: { fecha_vencimiento: "2026-06-05" },
      valor_nuevo: { fecha_vencimiento: "2026-06-10" },
      motivo: "Cliente solicito mover vencimiento por flujo de caja",
    },
  });

  // ── Empresa default ───────────────────────────────────────────────
  const empresaExiste = await prisma.empresa.findFirst();
  if (!empresaExiste) {
    await prisma.empresa.create({
      data: {
        nombre: "Estudio Jurídico",
        rut: "76000000-0",
        razon_social: "Estudio Jurídico SpA",
        giro: "Servicios jurídicos",
        activa: true,
      },
    });
  }

  // ── Plan de cuentas base ──────────────────────────────────────────
  const cuentas = [
    { codigo: "1101", nombre: "Banco / Cuentas Corrientes",              tipo: TipoCuentaContable.ACTIVO,     naturaleza: NaturalezaCuenta.DEUDORA },
    { codigo: "1102", nombre: "Caja",                                     tipo: TipoCuentaContable.ACTIVO,     naturaleza: NaturalezaCuenta.DEUDORA },
    { codigo: "1103", nombre: "Caja chica",                               tipo: TipoCuentaContable.ACTIVO,     naturaleza: NaturalezaCuenta.DEUDORA },
    { codigo: "1104", nombre: "IVA crédito fiscal",                       tipo: TipoCuentaContable.ACTIVO,     naturaleza: NaturalezaCuenta.DEUDORA },
    { codigo: "1201", nombre: "Clientes / CxC",                           tipo: TipoCuentaContable.ACTIVO,     naturaleza: NaturalezaCuenta.DEUDORA },
    { codigo: "2101", nombre: "Proveedores / CxP",                        tipo: TipoCuentaContable.PASIVO,     naturaleza: NaturalezaCuenta.ACREEDORA },
    { codigo: "2102", nombre: "Retenciones por pagar",                    tipo: TipoCuentaContable.PASIVO,     naturaleza: NaturalezaCuenta.ACREEDORA },
    { codigo: "2103", nombre: "IVA débito fiscal",                        tipo: TipoCuentaContable.PASIVO,     naturaleza: NaturalezaCuenta.ACREEDORA },
    { codigo: "3101", nombre: "Capital",                                  tipo: TipoCuentaContable.PATRIMONIO, naturaleza: NaturalezaCuenta.ACREEDORA },
    { codigo: "4101", nombre: "Ingresos por servicios legales",           tipo: TipoCuentaContable.INGRESO,    naturaleza: NaturalezaCuenta.ACREEDORA },
    { codigo: "4102", nombre: "Otros Ingresos",                           tipo: TipoCuentaContable.INGRESO,    naturaleza: NaturalezaCuenta.ACREEDORA },
    { codigo: "5101", nombre: "Gastos operacionales",                     tipo: TipoCuentaContable.GASTO,      naturaleza: NaturalezaCuenta.DEUDORA },
    { codigo: "5102", nombre: "Honorarios profesionales",                 tipo: TipoCuentaContable.GASTO,      naturaleza: NaturalezaCuenta.DEUDORA },
    { codigo: "5201", nombre: "Descuentos / condonaciones / incobrables", tipo: TipoCuentaContable.GASTO,      naturaleza: NaturalezaCuenta.DEUDORA },
  ];

  for (const c of cuentas) {
    const existe = await prisma.cuentaContable.findFirst({ where: { codigo: c.codigo, empresa_id: null } });
    if (!existe) {
      await prisma.cuentaContable.create({ data: { ...c, empresa_id: null, nivel: 1, acepta_movimientos: true, activa: true } });
    }
  }

  // ── Tipos de comprobante ──────────────────────────────────────────
  const tipos = [
    { nombre: "INGRESO",  prefijo: "ING" },
    { nombre: "EGRESO",   prefijo: "EGR" },
    { nombre: "VENTA",    prefijo: "VTA" },
    { nombre: "COMPRA",   prefijo: "CMP" },
    { nombre: "AJUSTE",   prefijo: "AJU" },
    { nombre: "REVERSA",  prefijo: "REV" },
    { nombre: "TRASPASO", prefijo: "TRP" },
  ];

  for (const t of tipos) {
    const existe = await prisma.tipoComprobanteContable.findFirst({ where: { nombre: t.nombre } });
    if (!existe) {
      await prisma.tipoComprobanteContable.create({ data: { ...t, siguiente_numero: 1, activo: true } });
    }
  }

  // ── Impuestos base ────────────────────────────────────────────────
  const impuestos = [
    { nombre: "IVA 19%",                    tipo: "IVA",                  tasa: 0.19  },
    { nombre: "Exento",                      tipo: "EXENTO",               tasa: 0.0   },
    { nombre: "Retención honorarios 14.5%", tipo: "RETENCION_HONORARIOS", tasa: 0.145 },
  ];

  for (const imp of impuestos) {
    const existe = await prisma.impuesto.findFirst({ where: { tipo: imp.tipo, empresa_id: null } });
    if (!existe) {
      await prisma.impuesto.create({ data: { ...imp, empresa_id: null, activo: true } });
    }
  }

  console.log("Seed completado.");
  console.log("Admin: admin@legalfinance.local / Admin123!");
  console.log("Contador: contador@legalfinance.local / Contador123!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
