// Retrotrae el halted_at de un caso para validar el cron de warnings.
// Uso: node scripts/seed-test-warning.cjs <caseCode> <diasAtraso>
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const code = process.argv[2] ?? "AT-TEST-002";
  const dias = Number(process.argv[3] ?? 12);
  const ref = new Date(Date.now() - dias * 86_400_000);
  const updated = await p.case.updateMany({
    where: { code },
    data: {
      halted_at: ref,
      halted_reason: `Prueba: halted_at retroactivo a ${dias} días para validar cron.`,
      stage: "HALTED_BY_PAYMENT",
    },
  });
  // Borrar warnings previos para que la corrida los recree limpios.
  const k = await p.case.findFirst({ where: { code }, select: { id: true } });
  if (k) {
    await p.caseWarning.deleteMany({ where: { caseId: k.id } });
  }
  console.log(`Updated ${updated.count} cases (code=${code}, halted_at=-${dias}d)`);
  await p.$disconnect();
})();
