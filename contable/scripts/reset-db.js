/**
 * Limpia todos los datos de clientes (contratos, cuotas, pagos, etc.).
 * Conserva: Usuario, SistemaExterno, ExternalSyncLog, IntegrationEvent.
 * Uso: node scripts/reset-db.js
 */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("=== LIMPIEZA DE CLIENTES ===\n");

  // Null FKs opcionales que bloquearian el delete
  console.log("Limpiando referencias opcionales...");
  await prisma.cuota.updateMany({ data: { caso_legal_id: null } });
  await prisma.installmentImportItem.updateMany({ data: { created_cuota_id: null } });
  await prisma.contractImportItem.updateMany({ data: { created_contrato_id: null } });
  await prisma.clientImportItem.updateMany({ data: { created_cliente_id: null } });

  const steps = [
    ["AplicacionPago",      () => prisma.aplicacionPago.deleteMany()],
    ["CuotaWarning",        () => prisma.cuotaWarning.deleteMany()],
    ["GestionCobranza",     () => prisma.gestionCobranza.deleteMany()],
    ["CompromisoPago",      () => prisma.compromisoPago.deleteMany()],
    ["ModificacionContrato",() => prisma.modificacionContrato.deleteMany()],
    ["ExternalReference",   () => prisma.externalReference.deleteMany()],
    ["ClientImportBatch",   () => prisma.clientImportBatch.deleteMany()], // cascade -> items
    ["Pago",                () => prisma.pago.deleteMany()],
    ["CasoLegal",           () => prisma.casoLegal.deleteMany()],
    ["Cuota",               () => prisma.cuota.deleteMany()],
    ["Contrato",            () => prisma.contrato.deleteMany()],
    ["Cliente",             () => prisma.cliente.deleteMany()], // cascade -> contactos, facturacion
  ];

  for (const [label, fn] of steps) {
    const result = await fn();
    console.log(`${label}: ${result.count} registros eliminados`);
  }

  console.log("\n=== LISTO ===");
}

main()
  .catch((err) => {
    console.error("ERROR:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
