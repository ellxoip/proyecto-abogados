// Seed quick: añade perfil CrmClientProfile con RUT del seed de warnings de
// hive-financial-control para poder probar end-to-end el panel de morosidad.
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const r = await p.crmClientProfile.upsert({
    where: { identifier: "11111111-1" },
    create: {
      identifier: "11111111-1",
      rut: "11111111-1",
      nombre: "Cliente Test Warnings",
      telefono: "+56990000001",
      email: "test+warnings@example.com",
      magic_token: "tok-test-warn-001",
    },
    update: {},
  });
  console.log("Profile OK:", r.id);
  await p.$disconnect();
})();
