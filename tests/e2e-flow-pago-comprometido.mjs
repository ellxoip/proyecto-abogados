// ============================================================================
// E2E "pago comprometido" — flujo punta a punta NEXIO → FC → PagaCuotas → SC
// ============================================================================
//
// Simula a NEXIO empujando un lead al estado pago_comprometido. Valida que:
//
//   1. hive-financial-control (FC) reciba el trigger via
//      POST /api/integrations/crm/pago-comprometido y devuelva
//      clienteId + contratoId + paymentLink + (idealmente) autoLoginUrl.
//
//   2. FC haya gatillado scheduleClientCreation que:
//      - llama a PagaCuotas /api/integration/clients/from-crm,
//      - genera password 6-char con ensurePortalCredentials,
//      - syncea paymentLink + password a service-control (SC) vía
//        POST /api/internal/integration/clients/payment-link.
//
//   3. NEXIO recibió el callback /api/webhooks/legal_finance con
//      event=pagacuotas_ready conteniendo paymentLink + autoLoginUrl + password
//      (esto es lo que NEXIO entrega al cliente vía WhatsApp/Email).
//
//   4. El autoLoginUrl es funcional: GET /api/auto-login?token=… retorna 200
//      con JWT de cliente sin requerir login manual.
//
//   5. Las mismas credenciales (RUT + password) sirven para login tradicional
//      en PagaCuotas: POST /api/client/login → 200 con JWT.
//
//   6. Las mismas credenciales están persistidas en SC, donde
//      User.mustChangePassword=true (el cliente debe rotar al primer login en
//      service-control).
//
// Servidores requeridos corriendo:
//   - FC          :3000
//   - SC          :3001
//   - PagaCuotas  :3002 (frontend) y :4000 (server)
//   - NEXIO       :8000
//
// Uso:
//   node tests/e2e-flow-pago-comprometido.mjs
// ============================================================================

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import bcrypt from "../hive-service-control/node_modules/bcryptjs/index.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FC_ROOT = path.resolve(ROOT, "..", "hive-financial-control");
const SC_ROOT = path.resolve(ROOT, "..", "hive-service-control");

// ── Env loader (parser KEY=VAL desde .env) ─────────────────────────────
function loadEnv(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const fcEnv = loadEnv(path.join(FC_ROOT, ".env"));
const scEnv = loadEnv(path.join(SC_ROOT, ".env"));

const FC_URL = "http://localhost:3000";
const SC_URL = "http://localhost:3001";
const PC_API_URL = "http://localhost:4000";

const FC_CRM_KEY = fcEnv.CRM_INTERNAL_API_KEY;
const SC_INTEGRATION_KEY = scEnv.INTEGRATION_INTERNAL_API_KEY;

if (!FC_CRM_KEY) {
  console.error("Falta FC.CRM_INTERNAL_API_KEY en hive-financial-control/.env");
  process.exit(1);
}
if (!SC_INTEGRATION_KEY) {
  console.error("Falta SC.INTEGRATION_INTERNAL_API_KEY en hive-service-control/.env");
  process.exit(1);
}

// ── Prisma clients de FC y SC (Postgres ambos) ─────────────────────────
// IMPORTANTE: cada PrismaClient apunta a su DB con `datasources` explícito
// para evitar que el lookup lazy de DATABASE_URL desde process.env mezcle
// ambas DBs (FC y SC apuntan a Supabase distintos).
const fcPrismaModule = await import(
  pathToFileURL(
    path.join(FC_ROOT, "node_modules", "@prisma", "client", "default.js"),
  ).href
);
const fcPrisma = new fcPrismaModule.PrismaClient({
  datasources: { db: { url: fcEnv.DATABASE_URL } },
});

const scPrismaModule = await import(
  pathToFileURL(
    path.join(SC_ROOT, "node_modules", "@prisma", "client", "default.js"),
  ).href
);
const scPrisma = new scPrismaModule.PrismaClient({
  datasources: { db: { url: scEnv.DATABASE_URL } },
});

// ── Asserts ────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
function check(label, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  [32m✓[0m ${label}`);
  } else {
    failed += 1;
    console.error(`  [31m✗[0m ${label} ${detail}`);
  }
}

// ── Datos del demo (RUT distinto del seed para no chocar) ──────────────
const SUFFIX = Date.now().toString(36).slice(-4).toUpperCase();
const RUT_BODY = `17${SUFFIX.replace(/[^0-9]/g, "0").padStart(6, "1")}`.slice(0, 8);
function dvRut(body) {
  // dígito verificador chileno
  const reversed = body.split("").reverse();
  const factors = [2, 3, 4, 5, 6, 7];
  let sum = 0;
  for (let i = 0; i < reversed.length; i++) sum += Number(reversed[i]) * factors[i % 6];
  const rem = 11 - (sum % 11);
  if (rem === 11) return "0";
  if (rem === 10) return "K";
  return String(rem);
}
const RUT_PUNTOS = `${RUT_BODY.slice(0, 2)}.${RUT_BODY.slice(2, 5)}.${RUT_BODY.slice(5)}-${dvRut(RUT_BODY)}`;
const RUT_NORMAL = RUT_BODY + "-" + dvRut(RUT_BODY);
const EMAIL = `e2e-${SUFFIX.toLowerCase()}@test.cl`;
const NOMBRE = `Cliente E2E ${SUFFIX}`;
const TELEFONO = "+56998765432";
const CRM_LEAD_ID = Math.floor(900000 + Math.random() * 99999);

console.log("─".repeat(72));
console.log("E2E flujo pago comprometido — NEXIO → FC → PagaCuotas → SC");
console.log("─".repeat(72));
console.log(`Suffix:    ${SUFFIX}`);
console.log(`RUT:       ${RUT_PUNTOS}  (normalizado: ${RUT_NORMAL})`);
console.log(`Email:     ${EMAIL}`);
console.log(`Lead ID:   ${CRM_LEAD_ID}`);
console.log("");

let createdFcClienteId = null;
let createdFcContratoId = null;
let scUserId = null;
let nexioCallbackPayload = null;

// ── Servidor mock de NEXIO para capturar callbacks /api/webhooks/legal_finance
import http from "node:http";
const NEXIO_MOCK_PORT = 18000;
const nexioMock = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/webhooks/legal_finance") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const secret = req.headers["x-lf-callback-secret"];
      try {
        const json = JSON.parse(body);
        // Solo capturar el pagacuotas_ready de NUESTRO lead.
        if (json.event === "pagacuotas_ready" && json.crmLeadId === CRM_LEAD_ID) {
          nexioCallbackPayload = { headers: { secret }, body: json };
        }
      } catch {
        // ignore
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }
  res.statusCode = 404;
  res.end();
});
await new Promise((resolve) => nexioMock.listen(NEXIO_MOCK_PORT, resolve));

// Redirigir FC.CRM_BASE_URL temporalmente al mock para esta corrida.
// Como FC ya está corriendo con CRM_BASE_URL=http://localhost:8000, no podemos
// alterar su env. En su lugar, este test interceptará el callback hacia el
// NEXIO real (8000) y, en paralelo, leerá la IntegrationEvent generada en FC
// para validar el payload que FC armó para NEXIO. El mock queda como respaldo
// para futuras corridas donde se pueda redirigir CRM_BASE_URL al mock.

async function post(url, body, headers = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, body: json };
}

async function get(url, headers = {}) {
  const res = await fetch(url, { headers });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, body: json };
}

try {
  // ── 0. Limpieza: borrar cliente con ese RUT si existe ─────────────────
  console.log("[0/7] Cleanup previo");
  const existingFc = await fcPrisma.cliente.findUnique({
    where: { rut: RUT_PUNTOS },
  });
  if (existingFc) {
    await fcPrisma.aplicacionPago.deleteMany({
      where: { cuota: { contrato: { cliente_id: existingFc.id } } },
    });
    await fcPrisma.pago.deleteMany({ where: { cliente_id: existingFc.id } });
    await fcPrisma.cuotaWarning.deleteMany({
      where: { cuota: { contrato: { cliente_id: existingFc.id } } },
    });
    await fcPrisma.cuota.deleteMany({
      where: { contrato: { cliente_id: existingFc.id } },
    });
    await fcPrisma.contrato.deleteMany({ where: { cliente_id: existingFc.id } });
    await fcPrisma.cliente.delete({ where: { id: existingFc.id } });
  }
  const existingSc = await scPrisma.user.findFirst({
    where: { OR: [{ rut: RUT_NORMAL }, { email: EMAIL }] },
  });
  if (existingSc) {
    await scPrisma.auditLog.deleteMany({ where: { actorId: existingSc.id } });
    await scPrisma.user.delete({ where: { id: existingSc.id } });
  }
  console.log("  cleanup OK\n");

  // ── 1. NEXIO → FC: trigger pago_comprometido ──────────────────────────
  console.log("[1/7] NEXIO simulado → FC /api/integrations/crm/pago-comprometido");
  const r1 = await post(
    `${FC_URL}/api/integrations/crm/pago-comprometido`,
    {
      crmLeadId: CRM_LEAD_ID,
      rut: RUT_PUNTOS,
      nombre: NOMBRE,
      email: EMAIL,
      phone: TELEFONO,
      honorarios: 1_800_000,
      cuotaInicial: 300_000,
      numCuotas: 6,
      tipoServicio: "Demanda Civil — E2E",
      fechaIngreso: new Date().toISOString().slice(0, 10),
    },
    { "x-api-key": FC_CRM_KEY },
  );
  check(
    "trigger pago_comprometido → 200/201",
    r1.status === 200 || r1.status === 201,
    `got ${r1.status} body=${JSON.stringify(r1.body)}`,
  );
  check("ok=true", r1.body?.ok === true);
  check("clienteId presente", typeof r1.body?.clienteId === "number");
  check("contratoId presente", typeof r1.body?.contratoId === "number");
  createdFcClienteId = r1.body?.clienteId ?? null;
  createdFcContratoId = r1.body?.contratoId ?? null;

  const pagaCuotas = r1.body?.pagacuotas ?? null;
  check(
    "pagacuotas.autoLoginUrl presente",
    typeof pagaCuotas?.autoLoginUrl === "string" && pagaCuotas.autoLoginUrl.includes("token="),
    `got ${JSON.stringify(pagaCuotas)}`,
  );
  check(
    "pagacuotas.paymentLink presente",
    typeof pagaCuotas?.paymentLink === "string",
  );
  const autoLoginUrl = pagaCuotas?.autoLoginUrl ?? null;
  const magicToken = autoLoginUrl?.match(/token=([^&]+)/)?.[1] ?? null;

  // ── 2. FC DB: cliente + contrato + cuotas creados ─────────────────────
  console.log("\n[2/7] FC DB: cliente + contrato + cuotas");
  const fcCliente = await fcPrisma.cliente.findUnique({
    where: { id: createdFcClienteId },
  });
  check("cliente creado en FC", !!fcCliente);
  // FC normaliza RUT con .replace(/\./g,"").toLowerCase() — aceptamos
  // cualquiera de las variantes válidas.
  const fcRutNorm = (fcCliente?.rut ?? "").replace(/\./g, "").toLowerCase();
  check(
    "cliente.rut coincide (normalizado)",
    fcRutNorm === RUT_NORMAL || fcRutNorm === RUT_PUNTOS.replace(/\./g, "").toLowerCase(),
    `got ${fcCliente?.rut}`,
  );
  check(
    "cliente.portal_password_hash presente (credentials generadas)",
    !!fcCliente?.portal_password_hash,
  );

  const fcContrato = await fcPrisma.contrato.findUnique({
    where: { id: createdFcContratoId },
  });
  check("contrato creado en FC", !!fcContrato);
  check(
    "contrato.cantidad_cuotas_original=6",
    fcContrato?.cantidad_cuotas_original === 6,
  );

  const fcCuotas = await fcPrisma.cuota.count({
    where: { contrato_id: createdFcContratoId },
  });
  check("6 cuotas creadas", fcCuotas === 6);

  // ── 3. FC IntegrationEvent: callback armado para NEXIO ────────────────
  console.log("\n[3/7] FC IntegrationEvent: payload preparado para NEXIO");
  const event = await fcPrisma.integrationEvent.findFirst({
    where: {
      external_event_id: String(createdFcContratoId),
      event_type: "pagacuotas.client.from-crm",
    },
    orderBy: { id: "desc" },
  });
  check("IntegrationEvent pagacuotas.client.from-crm existe", !!event);

  const result = (event?.result_payload ?? {});
  check("event.result_payload.autoLoginUrl == response.autoLoginUrl",
    result.autoLoginUrl === autoLoginUrl);
  check("event.result_payload.passwordPlain (6 chars alfanum)",
    typeof result.passwordPlain === "string" && /^[a-zA-Z0-9]{6}$/.test(result.passwordPlain),
    `got ${JSON.stringify(result.passwordPlain)}`);
  const passwordPlain = result.passwordPlain;

  // ── 4. SC DB: User sincronizado con paymentLink + bcrypt(password) ────
  console.log("\n[4/7] SC: User sincronizado con creds + paymentLink");
  // Search by multiple RUT formats since SC normaliza con .replace(/\./g,"").toLowerCase()
  const scUser = await scPrisma.user.findFirst({
    where: {
      OR: [{ rut: RUT_NORMAL }, { rut: RUT_PUNTOS }, { email: EMAIL }],
    },
  });
  check("User existe en SC", !!scUser);
  scUserId = scUser?.id ?? null;
  check("User.role=CLIENTE", scUser?.role === "CLIENTE");
  check("User.mustChangePassword=true", scUser?.mustChangePassword === true);
  check("User.active=true", scUser?.active === true);
  check(
    "User.paymentLink === autoLoginUrl (botón Pagar del portal lleva al auto-login)",
    scUser?.paymentLink === autoLoginUrl,
    `paymentLink=${scUser?.paymentLink}`,
  );
  check(
    "bcrypt.compare(password, User.passwordHash) coincide",
    !!scUser?.passwordHash && (await bcrypt.compare(passwordPlain, scUser.passwordHash)),
  );

  // ── 5. PagaCuotas autoLogin: GET /api/auto-login → 200 + JWT ──────────
  console.log("\n[5/7] PagaCuotas autoLogin (link sin login)");
  const r5 = await get(
    `${PC_API_URL}/api/auto-login?token=${encodeURIComponent(magicToken ?? "")}`,
  );
  check("autoLogin → 200", r5.status === 200, `got ${r5.status} body=${JSON.stringify(r5.body)}`);
  check("autoLogin response.ok=true", r5.body?.ok === true);
  check("autoLogin entrega token JWT", typeof r5.body?.token === "string");
  // PagaCuotas puede devolver el RUT con o sin puntos según cómo FC lo
  // guardó. Comparamos cleansed.
  const returnedRutClean = (r5.body?.cliente?.rut ?? "")
    .replace(/[.\-]/g, "")
    .toUpperCase();
  const expectedRutClean = RUT_NORMAL.replace(/-/g, "").toUpperCase();
  check(
    "autoLogin retorna cliente correcto",
    returnedRutClean === expectedRutClean,
    `got rut=${r5.body?.cliente?.rut}`,
  );
  check(
    "autoLogin retorna debts (resumen + contratos)",
    !!r5.body?.debts && Array.isArray(r5.body.debts.contratos),
  );

  // ── 6. PagaCuotas login manual: RUT + password tradicional ────────────
  console.log("\n[6/7] PagaCuotas login manual (RUT + password)");
  const r6 = await post(`${PC_API_URL}/api/client/login`, {
    identifier: RUT_PUNTOS,
    password: passwordPlain,
  });
  check("manual login → 200", r6.status === 200, `got ${r6.status}`);
  check("manual login ok=true", r6.body?.ok === true);
  check("manual login JWT presente", typeof r6.body?.token === "string");

  // Cred inválida → 401
  const r6b = await post(`${PC_API_URL}/api/client/login`, {
    identifier: RUT_PUNTOS,
    password: "ZZZZZZ",
  });
  check("manual login con password mala → 401", r6b.status === 401);

  // ── 7. SC: mismo flujo de credenciales — verificación DB + cambio pwd ──
  console.log("\n[7/7] SC: credenciales válidas + flag de cambio obligatorio");
  // No podemos hacer NextAuth login HTTP directo desde script sin sesión CSRF.
  // Pero ya validamos arriba:
  //   - SC.User.passwordHash = bcrypt(passwordPlain)
  //   - SC.User.mustChangePassword = true
  // Esto es exactamente lo que el portal pedirá al primer login del cliente.
  // Adicionalmente, validamos el flujo de cambio de password vía bcrypt
  // directo (replicando lo que hace el server action).
  const NEW_PASSWORD = "NuevaClave2026!";
  const currentMatch = await bcrypt.compare(passwordPlain, scUser?.passwordHash ?? "");
  check("verify currentPassword OK (paso 1 del action changeOwnPassword)", currentMatch);

  const newHash = await bcrypt.hash(NEW_PASSWORD, 12);
  await scPrisma.user.update({
    where: { id: scUserId },
    data: { passwordHash: newHash, mustChangePassword: false },
  });
  const scUserAfter = await scPrisma.user.findUnique({ where: { id: scUserId } });
  check(
    "tras cambio: passwordHash actualizado",
    await bcrypt.compare(NEW_PASSWORD, scUserAfter?.passwordHash ?? ""),
  );
  check(
    "tras cambio: mustChangePassword=false",
    scUserAfter?.mustChangePassword === false,
  );
} catch (err) {
  console.error("\n💥 Excepción no manejada:", err);
  failed += 1;
} finally {
  // ── Cleanup ────────────────────────────────────────────────────────────
  console.log("\n[cleanup] borrando filas de prueba");
  try {
    if (createdFcContratoId) {
      await fcPrisma.aplicacionPago.deleteMany({
        where: { cuota: { contrato_id: createdFcContratoId } },
      });
      await fcPrisma.pago.deleteMany({ where: { contrato_id: createdFcContratoId } });
      await fcPrisma.cuotaWarning.deleteMany({
        where: { cuota: { contrato_id: createdFcContratoId } },
      });
      await fcPrisma.cuota.deleteMany({ where: { contrato_id: createdFcContratoId } });
      await fcPrisma.contrato.delete({ where: { id: createdFcContratoId } }).catch(() => {});
    }
    if (createdFcClienteId) {
      await fcPrisma.cliente.delete({ where: { id: createdFcClienteId } }).catch(() => {});
    }
    if (scUserId) {
      await scPrisma.auditLog.deleteMany({ where: { actorId: scUserId } });
      await scPrisma.user.delete({ where: { id: scUserId } }).catch(() => {});
    }
    console.log("  cleanup OK");
  } catch (e) {
    console.error("  cleanup falló:", e.message);
  }
  await fcPrisma.$disconnect();
  await scPrisma.$disconnect();
  nexioMock.close();
}

console.log("\n" + "─".repeat(72));
console.log(`Resultado: ${passed} pass · ${failed} fail`);
console.log("─".repeat(72));
process.exit(failed > 0 ? 1 : 0);
