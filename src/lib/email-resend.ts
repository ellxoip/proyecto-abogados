import { Resend } from "resend";

const API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM_EMAIL ?? "AT Informa <noreply@atinforma.cl>";

const client =
  API_KEY && API_KEY !== "REEMPLAZAR_CON_API_KEY_RESEND" ? new Resend(API_KEY) : null;

export type EmailSendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string }
  | { skipped: true };

export type EmailTemplate =
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
  toEmail: string;
  toName: string;
  caseCode: string;
  template: EmailTemplate;
  body?: string;
};

const SUBJECTS: Record<EmailTemplate, (code: string) => string> = {
  initial_invoice: (c) => `Caso ${c} — Cobro inicial`,
  case_update: (c) => `Caso ${c} — Nueva actualización`,
  public_comment: (c) => `Caso ${c} — Nuevo comentario`,
  overdue_notice: (c) => `Caso ${c} — Aviso de mora`,
  payment_receipt: (c) => `Caso ${c} — Pago confirmado`,
  case_finished: (c) => `Caso ${c} — Cierre del caso`,
  non_payment_warning: (c) => `Caso ${c} — Aviso por falta de pago`,
  client_credentials: (c) => `Bienvenido a AT Informa — Credenciales de Acceso (${c})`,
  lead_confirmation: (c) => `AT Informa — Reunión confirmada (${c})`,
  lead_reminder: (c) => `AT Informa — Recordatorio: tu reunión empieza pronto (${c})`,
  lead_reassigned: (c) => `AT Informa — Cambio de profesional asignado (${c})`,
};

export async function sendEmailTemplate(args: SendArgs): Promise<EmailSendResult> {
  if (!client) return { skipped: true };

  const subject = SUBJECTS[args.template](args.caseCode);
  const html = renderHtml(args);

  try {
    const res = await client.emails.send({
      from: FROM,
      to: args.toEmail,
      subject,
      html,
    });
    if (res.error) return { ok: false, error: res.error.message };
    if (!res.data?.id) return { ok: false, error: "no message id in response" };
    return { ok: true, messageId: res.data.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function renderHtml({ toName, caseCode, template, body }: SendArgs): string {
  const greeting = `<p>Estimado/a ${escapeHtml(toName)},</p>`;
  const ref = `<p>Referencia: <strong>${escapeHtml(caseCode)}</strong></p>`;
  const main = body
    ? `<p>${escapeHtml(body).replace(/\n/g, "<br>")}</p>`
    : `<p>${defaultBody(template)}</p>`;
  const footer = `<hr/><p style="color:#666;font-size:12px">AT Informa — este es un mensaje automático del sistema de gestión de casos.</p>`;
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#222">${greeting}${main}${ref}${footer}</body></html>`;
}

function defaultBody(template: EmailTemplate): string {
  switch (template) {
    case "initial_invoice":
      return "Su caso ha sido registrado. Por favor revise su portal para completar el pago inicial y activar el caso.";
    case "case_update":
      return "Hay una nueva actualización en su caso. Ingrese al portal para ver los detalles.";
    case "public_comment":
      return "Se agregó un nuevo comentario público a su caso. Ingrese al portal para revisarlo.";
    case "overdue_notice":
      return "Su caso registra un aviso de mora. Por favor regularice su situación a la brevedad.";
    case "payment_receipt":
      return "Hemos recibido su pago. Su caso continúa activo.";
    case "case_finished":
      return "Su caso ha sido cerrado. Gracias por confiar en AT Informa.";
    case "non_payment_warning":
      return "Su caso se encuentra detenido por falta de pago. Regularice para reactivarlo.";
    case "client_credentials":
      return "Se han generado sus credenciales de acceso al portal de AT Informa. Ingrese con su correo electrónico y la contraseña proporcionada para consultar el estado de su caso.";
    case "lead_confirmation":
      return "Su reunión con AT Informa fue agendada correctamente. Recibirá un recordatorio una hora antes del encuentro.";
    case "lead_reminder":
      return "Le recordamos que su reunión con AT Informa comienza dentro de una hora. Manténgase atento al canal acordado.";
    case "lead_reassigned":
      return "Hemos reasignado su caso a otro profesional para garantizar la mejor atención. Recibirá novedades en breve.";
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
