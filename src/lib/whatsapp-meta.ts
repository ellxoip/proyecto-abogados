/**
 * Thin adapter over WhatsApp Business Cloud API (Meta).
 * Reads credentials from env. If unconfigured, the function returns a sentinel
 * { skipped: true } so the worker can complete in development without secrets.
 *
 * Resiliencia:
 *   - fetch sale con timeout (default 10s) y reintenta hasta 3 veces en
 *     errores transitorios (5xx, 429, abort/red). 4xx no se reintenta.
 *   - Tokens placeholder ("REEMPLAZAR_…") se tratan como no configurados →
 *     skipped, sin llamar a Meta.
 */
import { HttpTimeoutError, fetchWithRetry } from "@/lib/http-resilience";

const PHONE_ID = process.env.WHATSAPP_PHONE_ID ?? process.env.META_WHATSAPP_PHONE_ID;
const TOKEN = process.env.WHATSAPP_API_TOKEN ?? process.env.META_WHATSAPP_TOKEN;
const API_VERSION = process.env.WHATSAPP_API_VERSION ?? process.env.META_WHATSAPP_API_VERSION ?? "v20.0";

function isConfiguredSecret(value: string | undefined | null): value is string {
  if (!value) return false;
  if (value.startsWith("REEMPLAZAR")) return false;
  return value.trim().length > 0;
}

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string }
  | { skipped: true };

export type WhatsAppTemplate =
  | "initial_invoice"
  | "case_update"
  | "public_comment"
  | "overdue_notice"
  | "payment_receipt"
  | "case_finished"
  | "non_payment_warning"
  | "lead_confirmation"
  | "lead_reminder"
  | "lead_reassigned";

type SendArgs = {
  toPhoneE164: string;
  template: WhatsAppTemplate;
  variables: string[];
};

export async function sendWhatsAppTemplate(args: SendArgs): Promise<SendResult> {
  if (!isConfiguredSecret(PHONE_ID) || !isConfiguredSecret(TOKEN)) {
    return { skipped: true };
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_ID}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: normalizeMsisdn(args.toPhoneE164),
    type: "template",
    template: {
      name: args.template,
      language: { code: "es_CL" },
      components:
        args.variables.length > 0
          ? [
              {
                type: "body",
                parameters: args.variables.map((v) => ({ type: "text", text: v })),
              },
            ]
          : undefined,
    },
  };

  try {
    const res = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      { attempts: 3, timeoutMs: 10_000 },
    );
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `meta ${res.status}: ${text.slice(0, 300)}` };
    }
    const data = (await res.json()) as { messages?: { id: string }[] };
    const id = data.messages?.[0]?.id;
    if (!id) return { ok: false, error: "no message id in response" };
    return { ok: true, messageId: id };
  } catch (err) {
    if (err instanceof HttpTimeoutError) return { ok: false, error: err.message };
    return { ok: false, error: (err as Error).message };
  }
}

function normalizeMsisdn(raw: string) {
  return raw.replace(/[^\d+]/g, "");
}
