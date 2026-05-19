/**
 * Seed demo end-to-end "Carlos" (lead post-NEXIO).
 *
 * Orquesta los 3 sistemas para un caso de demostración:
 *
 *   1. hive-financial-control (este sistema):
 *      - Upsert de Cliente + Contrato + Cuotas (cuota inicial PAGADA, resto
 *        PENDIENTE) en su Postgres.
 *
 *   2. PagaCuotas + hive-service-control (vía PagaCuotasNotifyService real):
 *      - Llama a PagaCuotas `/api/integration/clients/from-crm` → recibe
 *        un `autoLoginUrl` con magic_token (cliente entra sin loguearse).
 *      - Genera una password aleatoria de 6 chars para PagaCuotas y la
 *        hashea en `Cliente.portal_password_hash`.
 *      - Pushea ese mismo paymentLink + password al service-control vía
 *        `POST /api/internal/integration/clients/payment-link` para que el
 *        botón "Pagar cuotas pendientes" del portal cliente quede listo.
 *      - Si hay CRM_BASE_URL configurado, notifica a NEXIO el pago
 *        comprometido (`pagacuotas_ready`).
 *
 *   3. service-control:
 *      - Crea el caso "AT-CARLOS-001" con la OT (work_order) generada en
 *        NEXIO via POST /api/internal/integration/cases. La OT queda como
 *        Update con document_url, visible en /admin/casos/{id}.
 *
 * Idempotente: re-ejecutar reusa cliente, contrato y caso.
 *
 * Uso:
 *   cd hive-financial-control
 *   npx tsx scripts/seed-demo-carlos.ts
 *
 * Variables requeridas en hive-financial-control/.env:
 *   - PAGACUOTAS_API_URL, PAGACUOTAS_CRM_API_KEY, PAGACUOTAS_PORTAL_URL
 *   - HIVE_SERVICE_URL, HIVE_SERVICE_API_KEY
 *   - (opcional) CRM_BASE_URL, CRM_INTERNAL_API_KEY para notificar NEXIO.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// PagaCuotasNotifyService lee envs en el constructor (PAGACUOTAS_API_URL,
// PAGACUOTAS_CRM_API_KEY, HIVE_SERVICE_*). tsx no carga .env por defecto,
// así que parseamos manual ANTES de importar el service.
(function loadEnv() {
  const envFile = path.resolve(__dirname, "..", ".env");
  if (!existsSync(envFile)) return;
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
})();

import {
  PrismaClient,
  EstadoContrato,
  EstadoCuota,
  TipoCliente,
} from "@prisma/client";
import { PagaCuotasNotifyService } from "../src/server/services/integrations/pagacuotas-notify.service";

const prisma = new PrismaClient();

// ── Datos del demo ──────────────────────────────────────────────────────
// RUT `16.798.821-0` queda reservado al `cliente.demo@hivecontrol.cl` del
// seed base de service-control. Usamos uno distinto para evitar colisión.
const RUT = "15.879.421-3";
const NOMBRE = "Carlos Demo";
const EMAIL = "carlos@gmail.com";
const TELEFONO = "+56990699607";
const CASE_CODE = "AT-CARLOS-001";
const CRM_LEAD_ID = 26001;
const CORRELATION_ID = "demo-carlos-001";
const SERVICIO = "Demanda Civil — Demo";

const MONTO_TOTAL = 1_800_000;
const PAGO_INICIAL = 300_000;
const NUM_CUOTAS = 6; // cuota 1 = pago inicial, 2..6 mensual
const MONTO_CUOTA = (MONTO_TOTAL - PAGO_INICIAL) / (NUM_CUOTAS - 1);

// ── Resolución de la URL + API key de service-control para crear el caso ─
function resolveServiceControlConfig() {
  const url = process.env.HIVE_SERVICE_URL ?? "http://localhost:3001";
  let apiKey = process.env.HIVE_SERVICE_API_KEY ?? null;

  if (!apiKey) {
    const fcEnv = path.resolve(__dirname, "..", ".env");
    if (existsSync(fcEnv)) {
      for (const line of readFileSync(fcEnv, "utf8").split(/\r?\n/)) {
        const m = line.match(/^HIVE_SERVICE_API_KEY\s*=\s*"?([^"]+)"?$/);
        if (m) {
          apiKey = m[1].trim();
          break;
        }
      }
    }
  }
  if (!apiKey) {
    throw new Error(
      "HIVE_SERVICE_API_KEY no resolvió. Definela en .env o env var.",
    );
  }
  return { url, apiKey };
}

async function seedFinancialControl() {
  console.log("→ [1/3] financial-control: cliente + contrato + cuotas");
  const hoy = new Date();

  const cliente = await prisma.cliente.upsert({
    where: { rut: RUT },
    create: {
      rut: RUT,
      nombre: NOMBRE,
      tipo_cliente: TipoCliente.PERSONA,
      telefono: TELEFONO,
      email: EMAIL,
      fecha_ingreso: hoy,
    },
    update: { nombre: NOMBRE, telefono: TELEFONO, email: EMAIL },
  });
  console.log(`   ✓ Cliente #${cliente.id} (${cliente.rut})`);

  const idempotencyKey = `demo-carlos-${RUT}`;
  const contrato = await prisma.contrato.upsert({
    where: { idempotency_key: idempotencyKey },
    create: {
      cliente_id: cliente.id,
      tipo_servicio: SERVICIO,
      fecha_contrato: hoy,
      monto_ccto: MONTO_TOTAL.toString(),
      monto_pago_inicial: PAGO_INICIAL.toString(),
      saldo_financiado: (MONTO_TOTAL - PAGO_INICIAL).toString(),
      cantidad_cuotas_original: NUM_CUOTAS,
      estado: EstadoContrato.ACTIVO,
      crm_lead_id: CRM_LEAD_ID,
      correlation_id: CORRELATION_ID,
      idempotency_key: idempotencyKey,
      observaciones: "Caso demo end-to-end — scripts/seed-demo-carlos.ts",
    },
    update: { estado: EstadoContrato.ACTIVO },
  });
  console.log(`   ✓ Contrato #${contrato.id} (${contrato.tipo_servicio})`);

  // Borrar dependencias FK antes de las cuotas.
  await prisma.aplicacionPago.deleteMany({
    where: { cuota: { contrato_id: contrato.id } },
  });
  await prisma.pago.deleteMany({ where: { contrato_id: contrato.id } });
  await prisma.cuotaWarning.deleteMany({
    where: { cuota: { contrato_id: contrato.id } },
  });
  await prisma.cuota.deleteMany({ where: { contrato_id: contrato.id } });
  await prisma.cuota.create({
    data: {
      contrato_id: contrato.id,
      numero_cuota: 1,
      fecha_vencimiento: hoy,
      monto_original: PAGO_INICIAL.toString(),
      monto_actual: PAGO_INICIAL.toString(),
      monto_pagado: PAGO_INICIAL.toString(),
      saldo_pendiente: "0.00",
      estado: EstadoCuota.PAGADA,
      cobrable: true,
      fecha_pago: hoy,
    },
  });
  for (let i = 2; i <= NUM_CUOTAS; i++) {
    const venc = new Date(hoy);
    venc.setMonth(venc.getMonth() + (i - 1));
    const monto = Number(MONTO_CUOTA.toFixed(2));
    await prisma.cuota.create({
      data: {
        contrato_id: contrato.id,
        numero_cuota: i,
        fecha_vencimiento: venc,
        monto_original: monto.toString(),
        monto_actual: monto.toString(),
        monto_pagado: "0.00",
        saldo_pendiente: monto.toString(),
        estado: EstadoCuota.PENDIENTE,
        cobrable: i === 2,
      },
    });
  }
  console.log(`   ✓ ${NUM_CUOTAS} cuotas (1 PAGADA, ${NUM_CUOTAS - 1} PENDIENTE)`);

  return { cliente, contrato };
}

async function syncToPagaCuotasAndServiceControl(
  clienteId: number,
  contratoId: number,
) {
  console.log(
    "→ [2/3] PagaCuotas + service-control: autoLoginUrl + paymentLink (vía PagaCuotasNotifyService)",
  );
  const result = await new PagaCuotasNotifyService().scheduleClientCreation({
    clienteId,
    contratoId,
    rut: RUT,
    nombre: NOMBRE,
    email: EMAIL,
    telefono: TELEFONO,
    // crmLeadId = null para evitar callback a NEXIO (el lead 26001 no
    // existe en NEXIO DB; este es un demo sintético). La generación de
    // credenciales + push a SC sigue ocurriendo igual gracias al refactor.
    crmLeadId: null,
    correlationId: CORRELATION_ID,
  });

  if (!result.ok) {
    throw new Error(
      `scheduleClientCreation falló (status=${result.status}, attempts=${result.attempts}): ${result.error ?? "sin detalle"}`,
    );
  }
  console.log(`   ✓ autoLoginUrl: ${result.autoLoginUrl ?? "(no se generó)"}`);
  console.log(`   ✓ paymentLink:  ${result.paymentLink}`);
  console.log(
    `   ✓ portalUrl:    ${result.portalUrl}  (fallback si autoLoginUrl expira)`,
  );
  return result;
}

async function pushCaseWithWorkOrder(
  scUrl: string,
  scKey: string,
  contratoId: number,
  paymentLink: string,
) {
  console.log(
    "→ [3/3] service-control: crear caso + OT (NEXIO) en documentos del SuperAdmin",
  );

  const workOrder = {
    id: 999_001,
    type: "DEMANDA_INICIAL",
    status: "READY",
    is_copy: false,
    created_at: new Date().toISOString(),
    document_url: "https://nexio.cl/docs/ot-demo-carlos.pdf",
    fields: {
      abogado: "Pedro Ramírez",
      urgencia: "alta",
      tribunal: "Juzgado Civil de Santiago",
      monto_demandado: 1_800_000,
      observaciones:
        "Cliente derivado desde lead NEXIO #26001. Pago inicial confirmado en PagaCuotas.",
    },
  };

  const res = await fetch(`${scUrl}/api/internal/integration/cases`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": scKey,
    },
    body: JSON.stringify({
      rut: RUT,
      nombre: NOMBRE,
      email: EMAIL,
      telefono: TELEFONO,
      // El password real ya fue seteado por scheduleClientCreation. Aquí
      // mandamos uno placeholder porque el endpoint lo exige; SC lo
      // re-hashea pero como `mustChangePassword` quedó false (el cliente ya
      // tiene su clave generada en PagaCuotas) el campo se ignora en la
      // ruta de upsert si ya hay user con esa identidad.
      password_plain: "PLCHLD",
      case_code: CASE_CODE,
      service_category: "CIVIL",
      crm_lead_id: CRM_LEAD_ID,
      correlation_id: CORRELATION_ID,
      initial_payment_amount: PAGO_INICIAL,
      contrato_id_sis_contable: contratoId,
      payment_link: paymentLink,
      source: "NEXIO",
      financials: {
        honorarios: MONTO_TOTAL,
        cuota_inicial: PAGO_INICIAL,
        num_cuotas: NUM_CUOTAS,
        monto_cuota: Number(MONTO_CUOTA.toFixed(2)),
      },
      team: { vendedor: "Marcela Soto", agendadora: "Camila Vergara" },
      work_order: workOrder,
    }),
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`cases respondió ${res.status}: ${JSON.stringify(body)}`);
  }
  console.log(
    `   ✓ Caso ${CASE_CODE} ${res.status === 201 ? "creado" : "actualizado"} (caseId=${body?.caseId})`,
  );
  console.log(`   ✓ OT NEXIO adjuntada como Update (updateId=${body?.updateId})`);
}

async function main() {
  console.log("Demo Carlos — orquestación end-to-end (flow real)");
  console.log("");

  const { cliente, contrato } = await seedFinancialControl();
  const notify = await syncToPagaCuotasAndServiceControl(cliente.id, contrato.id);

  const sc = resolveServiceControlConfig();
  await pushCaseWithWorkOrder(sc.url, sc.apiKey, contrato.id, notify.paymentLink ?? "");

  // Recuperamos la password recién generada para mostrarla.
  const integrationEvent = await prisma.integrationEvent.findFirst({
    where: {
      external_event_id: String(contrato.id),
      event_type: "pagacuotas.client.from-crm",
    },
    orderBy: { id: "desc" },
  });
  const passwordPlain =
    ((integrationEvent?.result_payload ?? {}) as { passwordPlain?: string | null })
      .passwordPlain ?? null;

  console.log("");
  console.log("✓ Demo cargado. Acceso PagaCuotas para Carlos:");
  console.log(`    RUT:           ${RUT}`);
  console.log(`    Password:      ${passwordPlain ?? "(no se generó — revisar logs)"}`);
  console.log(`    autoLoginUrl:  ${notify.autoLoginUrl ?? "(ausente)"}`);
  console.log(`    paymentLink:   ${notify.paymentLink}`);
  console.log("");
  console.log("Service-control SuperAdmin: /admin/casos → buscar AT-CARLOS-001");
  console.log("Portal cliente SC: botón 'Pagar cuotas pendientes' → autoLoginUrl");
}

main()
  .catch((err) => {
    console.error("✗ Falló el seed demo:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
