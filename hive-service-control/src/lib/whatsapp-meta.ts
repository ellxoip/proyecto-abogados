/**
 * Thin adapter over WhatsApp Business Cloud API (Meta).
 * Reads credentials from env. If unconfigured, the function returns a sentinel
 * { skipped: true } so the worker can complete in development without secrets.
 */
const PHONE_ID = process.env.WHATSAPP_PHONE_ID ?? process.env.META_WHATSAPP_PHONE_ID;
const TOKEN = process.env.WHATSAPP_API_TOKEN ?? process.env.META_WHATSAPP_TOKEN;
const API_VERSION = process.env.WHATSAPP_API_VERSION ?? process.env.META_WHATSAPP_API_VERSION ?? "v20.0";

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
  | "client_credentials"
  | "lead_confirmation"
  | "lead_reminder"
  | "lead_reassigned";

type SendArgs = {
  toPhoneE164: string;
  template: WhatsAppTemplate;
  variables: string[];
};

export async function sendWhatsAppTemplate(args: SendArgs): Promise<SendResult> {
  if (!PHONE_ID || !TOKEN) return { skipped: true };

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
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `meta ${res.status}: ${text.slice(0, 300)}` };
    }
    const data = (await res.json()) as { messages?: { id: string }[] };
    const id = data.messages?.[0]?.id;
    if (!id) return { ok: false, error: "no message id in response" };
    return { ok: true, messageId: id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function normalizeMsisdn(raw: string) {
  return raw.replace(/[^\d+]/g, "");
}
