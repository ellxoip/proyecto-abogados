import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach } from "vitest";

// Aislamos los tests en un archivo SQLite dedicado. Si existía de una
// corrida previa lo borramos antes de aplicar el schema.
const TEST_DB_FILE = path.resolve(process.cwd(), "prisma", "test.db");
process.env.DATABASE_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;
process.env.INTEGRATION_INTERNAL_API_KEY = "test-internal-key";
process.env.INTEGRATION_INGEST_SECRET = "test-ingest-secret";
process.env.APP_URL = "http://localhost:3001";
process.env.PROCESSING_MODE = "inline";
process.env.NEXIO_PUBLIC_URL = "http://localhost:8000";

beforeAll(() => {
  if (existsSync(TEST_DB_FILE)) {
    try {
      unlinkSync(TEST_DB_FILE);
    } catch {
      // ignore — prisma db push regenera de todos modos
    }
  }
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
  });
});

afterAll(async () => {
  const { _prisma } = await import("@/lib/db/_client");
  await _prisma.$disconnect();
});

beforeEach(async () => {
  const { _prisma } = await import("@/lib/db/_client");
  // Limpieza determinista entre tests respetando FK order.
  await _prisma.leadGoogleCalendarEvent.deleteMany();
  await _prisma.googleCalendarConnection.deleteMany();
  await _prisma.aiCaseAnalysis.deleteMany();
  await _prisma.caseWarning.deleteMany();
  await _prisma.productivitySnapshot.deleteMany();
  await _prisma.timerSession.deleteMany();
  await _prisma.timeEntry.deleteMany();
  await _prisma.paymentEvent.deleteMany();
  await _prisma.comment.deleteMany();
  await _prisma.update.deleteMany();
  await _prisma.notification.deleteMany();
  await _prisma.lead.deleteMany();
  await _prisma.auditLog.deleteMany();
  await _prisma.slaDefinition.deleteMany();
  await _prisma.case.deleteMany();
  await _prisma.category.deleteMany();
  await _prisma.user.deleteMany();
});
