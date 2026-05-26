const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const rows = await p.caseWarning.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { case: { select: { code: true } } },
  });
  console.log(JSON.stringify(rows, null, 2));
  await p.$disconnect();
})();
