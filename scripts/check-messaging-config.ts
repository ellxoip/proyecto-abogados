/**
 * Validador de configuración para mensajería de service-control.
 *
 * Verifica:
 *   - META WhatsApp Cloud API: tokens cargados + healthcheck a /me
 *   - Resend: API key cargada + dominio verificado
 *   - Supabase Storage: buckets `case-audio` y `documents` accesibles
 *
 * Uso:
 *   cd hive-service-control
 *   npx tsx scripts/check-messaging-config.ts
 *
 * Variables opcionales:
 *   --whatsapp-to=+56912345678   envía un template real de prueba
 *   --email-to=jorge@example.cl  envía un email real de prueba
 *
 * Por defecto NO envía a nadie — solo valida que las credenciales
 * sean aceptadas por los proveedores.
 *
 * Exit code != 0 si algún check FAIL.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// Cargar .env del proyecto antes de importar libs.
(function loadEnv() {
  const file = path.resolve(__dirname, "..", ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
})();

type Status = "OK" | "WARN" | "FAIL";
const rows: { status: Status; section: string; detail: string }[] = [];
function record(status: Status, section: string, detail: string) {
  rows.push({ status, section, detail });
}

function parseArgs() {
  const out: Record<string, string> = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.+)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function isPlaceholder(v: string | undefined): boolean {
  if (!v) return true;
  if (v.startsWith("REEMPLAZAR")) return true;
  return v.trim().length === 0;
}

async function checkWhatsApp(testTo: string | null) {
  const phoneId = process.env.META_WHATSAPP_PHONE_ID ?? process.env.WHATSAPP_PHONE_ID;
  const token = process.env.META_WHATSAPP_TOKEN ?? process.env.WHATSAPP_API_TOKEN;
  const apiVer = process.env.META_WHATSAPP_API_VERSION ?? "v20.0";

  if (isPlaceholder(phoneId) || isPlaceholder(token)) {
    record("FAIL", "WhatsApp", "META_WHATSAPP_TOKEN o META_WHATSAPP_PHONE_ID son placeholders. Reemplazar con credenciales reales.");
    return;
  }
  record("OK", "WhatsApp", "tokens cargados desde .env");

  // Healthcheck: GET /{phoneId} con bearer. Debe devolver el number metadata.
  try {
    const url = `https://graph.facebook.com/${apiVer}/${phoneId}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 200) {
      const data = await res.json();
      record(
        "OK",
        "WhatsApp",
        `phone_number_id=${phoneId} verificado · display=${data?.display_phone_number ?? "?"}`,
      );
    } else {
      const body = await res.text().catch(() => "");
      record("FAIL", "WhatsApp", `Meta rechazó el token. HTTP ${res.status}: ${body.slice(0, 200)}`);
      return;
    }
  } catch (e) {
    record(
      "FAIL",
      "WhatsApp",
      `No se pudo contactar a Meta: ${e instanceof Error ? e.message : String(e)}`,
    );
    return;
  }

  if (testTo) {
    try {
      const { sendWhatsAppTemplate } = await import("@/lib/whatsapp-meta");
      const result = await sendWhatsAppTemplate({
        toPhoneE164: testTo,
        template: "public_comment",
        variables: ["Tester", "Hola desde check-messaging-config", "AT-TEST"],
      });
      if ("ok" in result && result.ok) {
        record("OK", "WhatsApp", `Template enviado a ${testTo} · messageId=${result.messageId}`);
      } else if ("skipped" in result) {
        record("WARN", "WhatsApp", "sendWhatsAppTemplate retornó skipped (revisar config)");
      } else {
        record("FAIL", "WhatsApp", `Envío rechazado: ${result.error}`);
      }
    } catch (e) {
      record("FAIL", "WhatsApp", `Envío falló: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

async function checkResend(testTo: string | null) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (isPlaceholder(apiKey)) {
    record("FAIL", "Resend", "RESEND_API_KEY es placeholder. Reemplazar con key real de https://resend.com");
    return;
  }
  if (!from) {
    record("FAIL", "Resend", "RESEND_FROM_EMAIL ausente.");
    return;
  }
  record("OK", "Resend", `API key cargada · from=${from}`);

  // Healthcheck: GET /domains para confirmar que la key es válida.
  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 200) {
      const data = (await res.json()) as { data?: Array<{ name: string; status: string }> };
      const domains = data?.data ?? [];
      const fromDomain = from.match(/@([^>\s]+)/)?.[1] ?? "";
      const match = domains.find((d) => d.name === fromDomain);
      if (match) {
        record(
          match.status === "verified" ? "OK" : "WARN",
          "Resend",
          `dominio ${fromDomain} status=${match.status}`,
        );
      } else if (fromDomain) {
        record(
          "WARN",
          "Resend",
          `dominio ${fromDomain} no aparece en la cuenta Resend (${domains.length} dominios). Verificar antes de enviar a producción.`,
        );
      }
    } else {
      const body = await res.text().catch(() => "");
      record("FAIL", "Resend", `API key rechazada. HTTP ${res.status}: ${body.slice(0, 200)}`);
      return;
    }
  } catch (e) {
    record("FAIL", "Resend", `No se pudo contactar a Resend: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  if (testTo) {
    try {
      const { Resend } = await import("resend");
      const client = new Resend(apiKey!);
      const r = await client.emails.send({
        from: from!,
        to: testTo,
        subject: "Smoke test — service-control mensajería",
        text: "Si recibes este email, Resend está operativo desde el backend.",
      });
      if (r.error) {
        record("FAIL", "Resend", `Email rechazado: ${r.error.message}`);
      } else {
        record("OK", "Resend", `Email enviado a ${testTo} · id=${r.data?.id}`);
      }
    } catch (e) {
      record("FAIL", "Resend", `Envío falló: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

async function checkBuckets() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey || url.includes("supabase.co") === false || serviceKey === "") {
    if (!url || !serviceKey) {
      record("FAIL", "Supabase", "NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_KEY ausentes.");
      return;
    }
  }
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
    const { data, error } = await admin.storage.listBuckets();
    if (error) {
      record("FAIL", "Supabase", `listBuckets falló: ${error.message}`);
      return;
    }
    const names = (data ?? []).map((b) => b.name);
    for (const needed of ["case-audio", "documents"]) {
      if (names.includes(needed)) {
        record("OK", "Supabase", `bucket "${needed}" presente`);
      } else {
        record("FAIL", "Supabase", `bucket "${needed}" NO existe — correr ensure-storage-buckets.ts`);
      }
    }
  } catch (e) {
    record("FAIL", "Supabase", `${e instanceof Error ? e.message : String(e)}`);
  }
}

async function main() {
  const args = parseArgs();
  console.log("Validador de mensajería — service-control");
  console.log("─".repeat(64));

  await checkWhatsApp(args["whatsapp-to"] ?? null);
  await checkResend(args["email-to"] ?? null);
  await checkBuckets();

  const colors: Record<Status, string> = {
    OK: "\x1b[32m",
    WARN: "\x1b[33m",
    FAIL: "\x1b[31m",
  };
  const reset = "\x1b[0m";
  for (const r of rows) {
    console.log(`  ${colors[r.status]}[${r.status.padEnd(4)}]${reset} ${r.section.padEnd(10)} ${r.detail}`);
  }
  console.log("─".repeat(64));
  const fails = rows.filter((r) => r.status === "FAIL").length;
  const warns = rows.filter((r) => r.status === "WARN").length;
  const oks = rows.filter((r) => r.status === "OK").length;
  console.log(`  Total: ${oks} OK · ${warns} WARN · ${fails} FAIL`);
  if (fails > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
