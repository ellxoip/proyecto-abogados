// ============================================================
// E2E "proyecto-abogados" — cross-process integration test
// ============================================================
//
// Simula a hive-financial-control invocando los endpoints internos
// de hive-service-control via HTTP real. Valida estado en Supabase
// directamente con Prisma. Crea filas con un sufijo único y las
// limpia al final.
//
// Requisitos:
//   - hive-service-control corriendo en http://localhost:3001
//   - .env de service-control con INTEGRATION_INTERNAL_API_KEY,
//     DATABASE_URL (Supabase Postgres).
//
// Ejecución:
//   node tests/e2e-proyecto-abogados.mjs
// ============================================================

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SC_ROOT = path.resolve(ROOT, "..", "hive-service-control");

// Cargar .env del service-control para tomar credenciales reales.
function loadEnv(file) {
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const env = loadEnv(path.join(SC_ROOT, ".env"));

const BASE_URL = "http://localhost:3001";
const API_KEY = env.INTEGRATION_INTERNAL_API_KEY;
const DATABASE_URL = env.DATABASE_URL;
const DIRECT_URL = env.DIRECT_URL;

if (!API_KEY) {
  console.error("INTEGRATION_INTERNAL_API_KEY ausente en hive-service-control/.env");
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error("DATABASE_URL ausente en hive-service-control/.env");
  process.exit(1);
}

// Cargar Prisma client desde service-control (esquema/Postgres ya generado).
process.env.DATABASE_URL = DATABASE_URL;
process.env.DIRECT_URL = DIRECT_URL;
const prismaClientPath = path.join(SC_ROOT, "node_modules", "@prisma", "client", "default.js");
const { PrismaClient } = await import(pathToFileURL(prismaClientPath).href);
const prisma = new PrismaClient();

// ── Asserts mínimos ────────────────────────────────────────
let passed = 0;
let failed = 0;
function check(label, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label} ${detail}`);
  }
}

// ── HTTP helper ────────────────────────────────────────────
async function post(pathPart, body) {
  const res = await fetch(`${BASE_URL}${pathPart}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // body vacío
  }
  return { status: res.status, body: json };
}

// ── Datos de prueba — sufijo único para no chocar ───────────
const SUFFIX = Date.now().toString(36);
const RUT_FORMATEADO = `11.111.${SUFFIX.slice(0, 3)}-K`;
const RUT_NORMALIZADO = RUT_FORMATEADO.replace(/\./g, "").toLowerCase();
const EMAIL = `e2e-${SUFFIX}@test.cl`;
const TELEFONO = "+56900000000";
const CASE_CODE = `AT-E2E-${SUFFIX}`;
const PASSWORD_INICIAL = `E2E${SUFFIX}`.toUpperCase().slice(0, 10);
const PAY_LINK = `https://pagacuotas.cl/c/e2e-${SUFFIX}`;

console.log("─".repeat(60));
console.log("E2E proyecto-abogados — cross-process via HTTP");
console.log("─".repeat(60));
console.log(`Suffix: ${SUFFIX}`);
console.log(`Target: ${BASE_URL}`);
console.log(`RUT:    ${RUT_NORMALIZADO}`);
console.log(`Case:   ${CASE_CODE}`);
console.log("");

let userId = null;
let caseId = null;

try {
  // ── 1. financial-control → payment-link ────────────────
  console.log("[1/6] POST /api/internal/integration/clients/payment-link");
  const r1 = await post("/api/internal/integration/clients/payment-link", {
    rut: RUT_FORMATEADO,
    nombre: "Cliente E2E",
    email: EMAIL,
    telefono: TELEFONO,
    payment_link: PAY_LINK,
    password_plain: PASSWORD_INICIAL,
    crm_lead_id: 9999,
    correlation_id: `e2e-${SUFFIX}`,
  });
  check("status 200", r1.status === 200, `got ${r1.status} body=${JSON.stringify(r1.body)}`);
  check("body.ok=true", r1.body?.ok === true);
  check("body.clientId presente", typeof r1.body?.clientId === "string");
  userId = r1.body?.clientId;

  // Verificación DB.
  const userAfterLink = await prisma.user.findFirst({ where: { rut: RUT_NORMALIZADO } });
  check("user creado en DB", !!userAfterLink);
  check("user.mustChangePassword=true", userAfterLink?.mustChangePassword === true);
  check("user.paymentLink coincide", userAfterLink?.paymentLink === PAY_LINK);
  check("user.role=CLIENTE", userAfterLink?.role === "CLIENTE");

  // ── 2. financial-control → cases (pago confirmado) ──────
  console.log("\n[2/6] POST /api/internal/integration/cases");
  const r2 = await post("/api/internal/integration/cases", {
    rut: RUT_FORMATEADO,
    nombre: "Cliente E2E",
    email: EMAIL,
    telefono: TELEFONO,
    password_plain: PASSWORD_INICIAL,
    case_code: CASE_CODE,
    service_category: "CIVIL",
    crm_lead_id: 9999,
    correlation_id: `e2e-${SUFFIX}`,
    initial_payment_amount: 300000,
    contrato_id_sis_contable: 8001,
    payment_link: PAY_LINK,
    source: "NEXIO",
    financials: {
      honorarios: 1800000,
      cuota_inicial: 300000,
      num_cuotas: 6,
      monto_cuota: 250000,
    },
    team: { vendedor: "E2E", agendadora: "E2E" },
    work_order: {
      id: 999,
      type: "DEMANDA_INICIAL",
      created_at: new Date().toISOString(),
      document_url: "https://nexio.cl/docs/ot-e2e.pdf",
      fields: { abogado: "E2E", urgencia: "alta" },
    },
  });
  check("status 201", r2.status === 201, `got ${r2.status} body=${JSON.stringify(r2.body)}`);
  check("body.wasCreated=true", r2.body?.wasCreated === true);

  const kase = await prisma.case.findUnique({ where: { code: CASE_CODE } });
  caseId = kase?.id ?? null;
  check("case creado en DB", !!kase);
  check("case.stage=OPEN", kase?.stage === "OPEN");
  check("case.is_paid=true", kase?.is_paid === true);
  check("case.client_id coincide con user", kase?.client_id === userAfterLink?.id);

  const updates = await prisma.update.findMany({ where: { caseId: caseId } });
  check("OT adjuntada como Update", updates.length === 1);
  check("Update.document_url coincide", updates[0]?.document_url === "https://nexio.cl/docs/ot-e2e.pdf");

  // ── 3. Idempotencia /cases ──────────────────────────────
  console.log("\n[3/6] Idempotencia /cases (2da llamada con mismo case_code)");
  const r3 = await post("/api/internal/integration/cases", {
    rut: RUT_FORMATEADO,
    nombre: "Cliente E2E",
    email: EMAIL,
    telefono: TELEFONO,
    password_plain: PASSWORD_INICIAL,
    case_code: CASE_CODE,
    service_category: "CIVIL",
    payment_link: PAY_LINK,
    source: "NEXIO",
  });
  check("status 200 (no duplica)", r3.status === 200, `got ${r3.status}`);
  const casesCount = await prisma.case.count({ where: { code: CASE_CODE } });
  check("solo 1 case con ese code", casesCount === 1);

  // ── 4. financial-control → WARNING_10 ───────────────────
  console.log("\n[4/6] POST /api/internal/integration/financial-warning (WARNING_10)");
  const warnPayload = {
    source: "hive-financial-control",
    warning_id: 1001,
    dias_atraso: 10,
    level: "WARNING_10",
    cliente: {
      id: 1,
      rut: RUT_FORMATEADO,
      nombre: "Cliente E2E",
      email: EMAIL,
      telefono: TELEFONO,
    },
    contrato: { id: 8001, external_id: "C-8001", estado: "ACTIVO" },
    cuota: {
      id: 5001,
      numero_cuota: 1,
      fecha_vencimiento: "2025-05-01",
    },
  };
  const r4 = await post("/api/internal/integration/financial-warning", warnPayload);
  check("status 200", r4.status === 200, `got ${r4.status} body=${JSON.stringify(r4.body)}`);
  check("matched=true", r4.body?.matched === true);
  check("caseCode coincide", r4.body?.caseCode === CASE_CODE);

  const audit10 = await prisma.auditLog.findFirst({
    where: { action: "EMAIL_SENT", caseId: caseId, message: { contains: "Warning 10" } },
  });
  check("audit Warning 10 registrado", !!audit10);

  // ── 5. WARNING_30 → halt + deactivate ────────────────────
  console.log("\n[5/6] POST financial-warning (WARNING_30 — corte)");
  const r5 = await post("/api/internal/integration/financial-warning", {
    ...warnPayload,
    warning_id: 1003,
    level: "WARNING_30",
    dias_atraso: 30,
  });
  check("status 200", r5.status === 200, `got ${r5.status}`);

  const kaseHalted = await prisma.case.findUnique({ where: { id: caseId } });
  check("case.stage=HALTED_BY_PAYMENT", kaseHalted?.stage === "HALTED_BY_PAYMENT");
  check("case.halted_at no nulo", kaseHalted?.halted_at !== null);

  const userHalted = await prisma.user.findUnique({ where: { id: userId } });
  check("user.active=false", userHalted?.active === false);

  const auditHalt = await prisma.auditLog.findFirst({
    where: { action: "CASE_HALTED", caseId: caseId },
  });
  check("audit CASE_HALTED registrado", !!auditHalt);

  // ── 6. Validaciones de seguridad ────────────────────────
  console.log("\n[6/6] Seguridad — auth y validación");
  const r6a = await fetch(`${BASE_URL}/api/internal/integration/cases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  check("sin x-api-key → 401", r6a.status === 401);

  const r6b = await post("/api/internal/integration/financial-warning", {
    level: "WARNING_99",
    dias_atraso: 1,
    cliente: { id: 1, rut: "0", nombre: "x" },
    contrato: { id: 1 },
    cuota: { id: 1, numero_cuota: 1, fecha_vencimiento: "2025-01-01" },
  });
  check("level inválido → 422", r6b.status === 422);
} catch (err) {
  console.error("\n💥 Excepción no manejada:", err);
  failed += 1;
} finally {
  // ── Cleanup ────────────────────────────────────────────
  console.log("\n[cleanup] borrando filas de prueba");
  try {
    if (caseId) {
      await prisma.update.deleteMany({ where: { caseId } });
      await prisma.auditLog.deleteMany({ where: { caseId } });
      await prisma.case.delete({ where: { id: caseId } }).catch(() => {});
    }
    if (userId) {
      await prisma.auditLog.deleteMany({ where: { actorId: userId } });
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
    console.log("  ✓ cleanup ok");
  } catch (e) {
    console.error("  ✗ cleanup fallo:", e.message);
  }
  await prisma.$disconnect();
}

console.log("\n" + "─".repeat(60));
console.log(`Resultado: ${passed} pass, ${failed} fail`);
console.log("─".repeat(60));
process.exit(failed > 0 ? 1 : 0);
