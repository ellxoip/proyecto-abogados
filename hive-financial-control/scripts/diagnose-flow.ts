/**
 * Diagnóstico end-to-end del flujo de pagos.
 *
 * Audita los 5 puentes que tienen que estar sanos para que el botón
 * "Generar acceso PagaCuotas" → autologin → pago funcione:
 *
 *   1. Puertos LISTENING:   FC :3000, SC :3001, PagaCuotas frontend :3002,
 *                            PagaCuotas server :4000, NEXIO :8000.
 *   2. Keys compartidas:    FC.HIVE_SERVICE_API_KEY === SC.INTEGRATION_INTERNAL_API_KEY,
 *                            FC.PAGACUOTAS_CRM_API_KEY === PagaCuotas.CRM_INTEGRATION_API_KEY,
 *                            FC.CRM_INTERNAL_API_KEY === NEXIO.LF_CALLBACK_SECRET.
 *   3. PagaCuotas en modo real: SIS_CONTABLE_LOCAL_FIXTURES=false,
 *                                SIS_CONTABLE_BASE_URL apunta a FC (no a SC).
 *   4. Auth real contra cada endpoint crítico (envía request y exige el
 *      status code esperado).
 *
 * Uso:
 *   cd hive-financial-control
 *   npx tsx scripts/diagnose-flow.ts
 *
 * Salida: tabla `[OK|WARN|FAIL]  componente  detalle`. Exit code != 0 si hay
 * algún FAIL.
 */

import { readFileSync, existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const FC_ENV = path.join(ROOT, "hive-financial-control", ".env");
const SC_ENV = path.join(ROOT, "hive-service-control", ".env");
const PC_ENV = path.join(ROOT, "PagaCuotas", ".env");
const NX_ENV = path.join(ROOT, "NEXIO", "backend", ".env");

type Status = "OK" | "WARN" | "FAIL";
const rows: { status: Status; section: string; detail: string }[] = [];

function record(status: Status, section: string, detail: string) {
  rows.push({ status, section, detail });
}

function loadEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const done = (open: boolean) => {
      sock.destroy();
      resolve(open);
    };
    sock.setTimeout(1500);
    sock.once("connect", () => done(true));
    sock.once("timeout", () => done(false));
    sock.once("error", () => done(false));
    sock.connect(port, "127.0.0.1");
  });
}

async function httpProbe(
  url: string,
  init: RequestInit = {},
  expectStatuses: number[] = [200, 201, 400, 401, 422],
): Promise<{ ok: boolean; status: number | null; body: string }> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(4000) });
    const text = await res.text().catch(() => "");
    return {
      ok: expectStatuses.includes(res.status),
      status: res.status,
      body: text.slice(0, 200),
    };
  } catch (e) {
    return {
      ok: false,
      status: null,
      body: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main() {
  const fc = loadEnv(FC_ENV);
  const sc = loadEnv(SC_ENV);
  const pc = loadEnv(PC_ENV);
  const nx = loadEnv(NX_ENV);

  // ── 1. Puertos ────────────────────────────────────────────────────
  const ports = [
    { port: 3000, name: "hive-financial-control" },
    { port: 3001, name: "hive-service-control" },
    { port: 3002, name: "PagaCuotas frontend (vite)" },
    { port: 4000, name: "PagaCuotas server (express)" },
    { port: 8000, name: "NEXIO backend (fastapi)" },
  ];
  for (const { port, name } of ports) {
    const up = await checkPort(port);
    record(up ? "OK" : "FAIL", "puerto", `:${port} ${name} ${up ? "LISTENING" : "no responde"}`);
  }

  // ── 2. Keys compartidas ───────────────────────────────────────────
  const checks = [
    {
      label: "FC.HIVE_SERVICE_API_KEY ↔ SC.INTEGRATION_INTERNAL_API_KEY",
      a: fc.HIVE_SERVICE_API_KEY,
      b: sc.INTEGRATION_INTERNAL_API_KEY,
      hint: "FC envía Bearer a /api/internal/integration/*",
    },
    {
      label: "FC.PAGACUOTAS_CRM_API_KEY ↔ PagaCuotas.CRM_INTEGRATION_API_KEY",
      a: fc.PAGACUOTAS_CRM_API_KEY,
      b: pc.CRM_INTEGRATION_API_KEY,
      hint: "FC dispara /api/integration/clients/from-crm a PagaCuotas",
    },
    {
      label: "FC.CRM_INTERNAL_API_KEY ↔ NEXIO.LF_CALLBACK_SECRET",
      a: fc.CRM_INTERNAL_API_KEY,
      b: nx.LF_CALLBACK_SECRET,
      hint: "FC notifica eventos a NEXIO con x-lf-callback-secret",
    },
    {
      label: "FC.PAGACUOTAS_INTERNAL_API_KEY ↔ PagaCuotas.SIS_CONTABLE_API_KEY",
      a: fc.PAGACUOTAS_INTERNAL_API_KEY,
      b: pc.SIS_CONTABLE_API_KEY,
      hint: "PagaCuotas → FC en /api/integrations/pagacuotas/*",
    },
  ];
  for (const c of checks) {
    if (!c.a || !c.b) {
      record("FAIL", "key", `${c.label} — falta(n) variable(s). ${c.hint}.`);
    } else if (c.a !== c.b) {
      record("FAIL", "key", `${c.label} — NO matchean. ${c.hint}.`);
    } else {
      record("OK", "key", c.label);
    }
  }

  // ── 3. URLs cruzadas ──────────────────────────────────────────────
  const urlChecks = [
    {
      label: "PagaCuotas.SIS_CONTABLE_BASE_URL apunta a FC (:3000)",
      value: pc.SIS_CONTABLE_BASE_URL,
      expected: "http://localhost:3000",
    },
    {
      label: "FC.HIVE_SERVICE_URL apunta a SC (:3001)",
      value: fc.HIVE_SERVICE_URL,
      expected: "http://localhost:3001",
    },
    {
      label: "FC.PAGACUOTAS_PORTAL_URL apunta a frontend (:3002)",
      value: fc.PAGACUOTAS_PORTAL_URL,
      expected: "http://localhost:3002",
    },
    {
      label: "FC.PAGACUOTAS_API_URL apunta a server (:4000)",
      value: fc.PAGACUOTAS_API_URL,
      expected: "http://localhost:4000",
    },
    {
      label: "FC.CRM_BASE_URL apunta a NEXIO (:8000)",
      value: fc.CRM_BASE_URL,
      expected: "http://localhost:8000",
    },
  ];
  for (const u of urlChecks) {
    if (!u.value) record("FAIL", "url", `${u.label} — ausente`);
    else if (u.value.replace(/\/+$/, "") !== u.expected)
      record("WARN", "url", `${u.label} — ${u.value} (esperado ${u.expected})`);
    else record("OK", "url", u.label);
  }

  // ── 4. Flags ──────────────────────────────────────────────────────
  if (pc.SIS_CONTABLE_LOCAL_FIXTURES === "true") {
    record(
      "FAIL",
      "flag",
      "PagaCuotas.SIS_CONTABLE_LOCAL_FIXTURES=true — sólo conoce al cliente demo hardcoded; ningún RUT real valida. Cambia a false.",
    );
  } else {
    record("OK", "flag", "PagaCuotas usando FC real (SIS_CONTABLE_LOCAL_FIXTURES=false)");
  }

  // ── 5. Conectividad HTTP real ─────────────────────────────────────
  // 5.1 SC /api/internal/integration/cases — espera 422 (payload vacío) si auth OK
  {
    const r = await httpProbe(
      "http://localhost:3001/api/internal/integration/cases",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": fc.HIVE_SERVICE_API_KEY ?? "",
        },
        body: "{}",
      },
      [400, 422],
    );
    if (r.ok)
      record("OK", "http", `FC → SC /cases — auth correcta (HTTP ${r.status})`);
    else if (r.status === 401)
      record("FAIL", "http", `FC → SC /cases — 401: key NO matchea`);
    else
      record("FAIL", "http", `FC → SC /cases — HTTP ${r.status ?? "ERR"} ${r.body}`);
  }

  // 5.2 PagaCuotas /api/integration/clients/from-crm — espera 400 (payload incompleto) si auth OK
  {
    const r = await httpProbe(
      "http://localhost:4000/api/integration/clients/from-crm",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-crm-api-key": fc.PAGACUOTAS_CRM_API_KEY ?? "",
        },
        body: "{}",
      },
      [400, 422],
    );
    if (r.ok)
      record("OK", "http", `FC → PagaCuotas /from-crm — auth correcta (HTTP ${r.status})`);
    else if (r.status === 401)
      record("FAIL", "http", `FC → PagaCuotas /from-crm — 401: key NO matchea`);
    else
      record("FAIL", "http", `FC → PagaCuotas /from-crm — HTTP ${r.status ?? "ERR"} ${r.body}`);
  }

  // 5.3 NEXIO /api/webhooks/legal_finance — espera 400/422 si auth OK
  {
    const r = await httpProbe(
      "http://localhost:8000/api/webhooks/legal_finance",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-lf-callback-secret": fc.CRM_INTERNAL_API_KEY ?? "",
        },
        body: JSON.stringify({ event: "diagnose_ping" }),
      },
      [200, 202, 400, 422],
    );
    if (r.ok)
      record("OK", "http", `FC → NEXIO /webhooks/legal_finance — auth correcta (HTTP ${r.status})`);
    else if (r.status === 401 || r.status === 403)
      record("FAIL", "http", `FC → NEXIO /webhooks — ${r.status}: secret NO matchea`);
    else
      record("FAIL", "http", `FC → NEXIO /webhooks — HTTP ${r.status ?? "ERR"} ${r.body}`);
  }

  // 5.4 PagaCuotas → FC /api/integrations/pagacuotas/client-login — credenciales falsas, espera 401
  {
    const r = await httpProbe(
      "http://localhost:3000/api/integrations/pagacuotas/client-login",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": pc.SIS_CONTABLE_API_KEY ?? "",
        },
        body: JSON.stringify({ identifier: "00000000-0", password: "ZZZZZZ" }),
      },
      [401], // creds inválidas pero la API responde
    );
    if (r.ok)
      record("OK", "http", `PagaCuotas → FC /client-login — endpoint accesible (HTTP 401 esperado por creds falsas)`);
    else if (r.status === 401 && r.body.includes("autorizado"))
      record(
        "FAIL",
        "http",
        `PagaCuotas → FC /client-login — 401 por API KEY incorrecta, no por creds.`,
      );
    else
      record(
        "WARN",
        "http",
        `PagaCuotas → FC /client-login — HTTP ${r.status ?? "ERR"} ${r.body}`,
      );
  }

  // ── Print ────────────────────────────────────────────────────────
  const colors: Record<Status, string> = {
    OK: "\x1b[32m",
    WARN: "\x1b[33m",
    FAIL: "\x1b[31m",
  };
  const reset = "\x1b[0m";
  console.log("");
  console.log("Diagnóstico end-to-end del flujo de pagos");
  console.log("─".repeat(80));
  for (const r of rows) {
    console.log(
      `  ${colors[r.status]}[${r.status.padEnd(4)}]${reset} ${r.section.padEnd(7)} ${r.detail}`,
    );
  }
  console.log("─".repeat(80));
  const okCount = rows.filter((r) => r.status === "OK").length;
  const warnCount = rows.filter((r) => r.status === "WARN").length;
  const failCount = rows.filter((r) => r.status === "FAIL").length;
  console.log(`  Total: ${okCount} OK · ${warnCount} WARN · ${failCount} FAIL`);
  if (failCount > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("✗ Diagnóstico falló:", err);
  process.exitCode = 1;
});
