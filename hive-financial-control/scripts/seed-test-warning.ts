/**
 * Seed de prueba: crea cliente + contrato + 3 cuotas vencidas en distintos
 * tramos (12, 22 y 33 días) para validar el cron de warnings end-to-end.
 *
 * Uso: tsx scripts/seed-test-warning.ts
 */
import { PrismaClient, EstadoContrato, EstadoCuota, TipoCliente } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const today = new Date();
  const rut = "11111111-1";

  // Cliente
  const cliente = await prisma.cliente.upsert({
    where: { rut },
    create: {
      rut,
      nombre: "Cliente Test Warnings",
      tipo_cliente: TipoCliente.PERSONA,
      telefono: "+56990000001",
      email: "test+warnings@example.com",
      fecha_ingreso: today,
    },
    update: {},
  });

  // Contrato
  const contrato = await prisma.contrato.upsert({
    where: { idempotency_key: "test-warnings-001" },
    create: {
      cliente_id: cliente.id,
      tipo_servicio: "PRESCRIPCION",
      fecha_contrato: today,
      monto_ccto: 600000,
      monto_pago_inicial: 100000,
      saldo_financiado: 500000,
      cantidad_cuotas_original: 5,
      estado: EstadoContrato.ACTIVO,
      idempotency_key: "test-warnings-001",
    },
    update: {},
  });

  const tramos = [
    { numero: 1, dias: 12 },
    { numero: 2, dias: 22 },
    { numero: 3, dias: 33 },
  ];

  for (const t of tramos) {
    const fecha = new Date(today);
    fecha.setUTCDate(fecha.getUTCDate() - t.dias);
    const monto = 100000;

    await prisma.cuota.upsert({
      where: { contrato_id_numero_cuota: { contrato_id: contrato.id, numero_cuota: t.numero } },
      create: {
        contrato_id: contrato.id,
        numero_cuota: t.numero,
        fecha_vencimiento: fecha,
        monto_original: monto,
        monto_actual: monto,
        saldo_pendiente: monto,
        estado: EstadoCuota.VENCIDA,
        cobrable: true,
      },
      update: {
        fecha_vencimiento: fecha,
        saldo_pendiente: monto,
        estado: EstadoCuota.VENCIDA,
        last_warning_level: null,
        last_warning_at: null,
      },
    });

    // Limpiar warnings previos para que la corrida sea fresh.
    await prisma.cuotaWarning.deleteMany({
      where: {
        contrato_id: contrato.id,
      },
    });
  }

  console.log("Seed OK. Cliente:", cliente.rut, "Contrato:", contrato.id);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
