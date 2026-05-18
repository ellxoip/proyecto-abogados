import {
  EstadoCuota,
  PrismaClient,
  RolUsuario,
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
