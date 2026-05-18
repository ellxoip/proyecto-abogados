import { AuditAction } from "@/lib/db-enums";
import { withSystemRls } from "@/lib/rls";
import type { EmailJob, WhatsAppJob } from "@/lib/notifications";
import { sendEmailTemplate, type EmailTemplate } from "@/lib/email-resend";
import { sendWhatsAppTemplate, type WhatsAppTemplate } from "@/lib/whatsapp-meta";
import { messageNotificationBody } from "@/lib/chat-message";

const LEAD_KINDS = new Set(["lead_confirmation", "lead_reminder", "lead_reassigned"] as const);

function isLeadJob(job: WhatsAppJob | EmailJob): job is Extract<WhatsAppJob | EmailJob, { leadId: string }> {
  return LEAD_KINDS.has(job.kind as never);
}

const WHATSAPP_TEMPLATE_FOR_KIND: Record<WhatsAppJob["kind"], WhatsAppTemplate> = {
  initial_invoice: "initial_invoice",
  case_update: "case_update",
  public_comment: "public_comment",
  overdue_notice: "overdue_notice",
  payment_receipt: "payment_receipt",
  case_finished: "case_finished",
  non_payment_warning: "non_payment_warning",
  client_credentials: "client_credentials",
  lead_confirmation: "lead_confirmation",
  lead_reminder: "lead_reminder",
  lead_reassigned: "lead_reassigned",
};

const EMAIL_TEMPLATE_FOR_KIND: Record<EmailJob["kind"], EmailTemplate> = {
  initial_invoice: "initial_invoice",
  case_update: "case_update",
  public_comment: "public_comment",
  overdue_notice: "overdue_notice",
  payment_receipt: "payment_receipt",
  case_finished: "case_finished",
  non_payment_warning: "non_payment_warning",
  client_credentials: "client_credentials",
  lead_confirmation: "lead_confirmation",
  lead_reminder: "lead_reminder",
  lead_reassigned: "lead_reassigned",
};

export async function processWhatsAppJob(payload: WhatsAppJob) {
  if (isLeadJob(payload)) {
    return processLeadWhatsApp(payload);
  }

  const template = WHATSAPP_TEMPLATE_FOR_KIND[payload.kind];
  const caseId = (payload as Extract<WhatsAppJob, { caseId: string }>).caseId;
  const ctx = await withSystemRls((tx) =>
    tx.case.findUnique({
      where: { id: caseId },
      select: {
        code: true,
        client: { select: { fullName: true, phone: true } },
      },
    }),
  );

  if (!ctx) {
    await auditCase(caseId, AuditAction.WHATSAPP_FAILED, "whatsapp", template, "failed", "case not found");
    throw new Error(`case ${caseId} not found`);
  }

  let variables: string[];
  if (payload.kind === "client_credentials") {
    const { generateClientPassword } = await import("@/lib/services/crm-onboarding");
    const firstName = ctx.client.fullName.split(" ")[0];
    const password = generateClientPassword(ctx.client.fullName, ctx.client.phone);
    const APP_URL = process.env.APP_URL ?? "http://localhost:3001";
    variables = [firstName, password, ctx.code, APP_URL + "/login"];
  } else {
    variables = [ctx.client.fullName, ctx.code];
  }

  const result = await sendWhatsAppTemplate({
    toPhoneE164: ctx.client.phone,
    template,
    variables,
  });

  if ("skipped" in result) {
    await auditCase(caseId, AuditAction.WHATSAPP_SENT, "whatsapp", template, "ok", "skipped (no credentials)");
    return { ok: true, skipped: true };
  }

  if (result.ok) {
    await auditCase(caseId, AuditAction.WHATSAPP_SENT, "whatsapp", template, "ok", `meta msg ${result.messageId}`);
    return { ok: true, messageId: result.messageId };
  }

  await auditCase(caseId, AuditAction.WHATSAPP_FAILED, "whatsapp", template, "failed", result.error);
  throw new Error(result.error);
}

export async function processEmailJob(payload: EmailJob) {
  if (isLeadJob(payload)) {
    return processLeadEmail(payload);
  }

  const template = EMAIL_TEMPLATE_FOR_KIND[payload.kind];
  const caseId = (payload as Extract<EmailJob, { caseId: string }>).caseId;
  const ctx = await withSystemRls(async (tx) => {
    const c = await tx.case.findUnique({
      where: { id: caseId },
      select: {
        code: true,
        client: { select: { fullName: true, email: true, phone: true } },
      },
    });
    if (!c) return null;

    let body: string | undefined;
    if (payload.kind === "client_credentials") {
      const { generateClientPassword } = await import("@/lib/services/crm-onboarding");
      const password = generateClientPassword(c.client.fullName, c.client.phone ?? "");
      const APP_URL = process.env.APP_URL ?? "http://localhost:3001";
      body = `Sus credenciales de acceso al portal Hive Control:\nEmail: ${c.client.email}\nContraseña: ${password}\n\nPortal de seguimiento: ${APP_URL}/login\n\nGuarde esta información de forma segura. Con estas credenciales podrá consultar su caso y descargar los documentos adjuntos.`;
    } else if (payload.kind === "case_update" && "updateId" in payload) {
      const u = await tx.update.findUnique({
        where: { id: payload.updateId },
        select: { description: true, document_url: true },
      });
      body = u?.description;
      if (u?.document_url) {
        const APP_URL = process.env.APP_URL ?? "http://localhost:3001";
        body = (body ? body + "\n\n" : "") + `Se adjuntó un documento a esta actualización. Ingrese a su portal (${APP_URL}/portal) y use su contraseña de acceso para descargarlo.`;
      }
    } else if (payload.kind === "public_comment" && "commentId" in payload) {
      const cm = await tx.comment.findUnique({
        where: { id: payload.commentId },
        select: { body: true },
      });
      body = cm?.body ? messageNotificationBody(cm.body) : undefined;
    }
    return { case: c, body };
  });

  if (!ctx) {
    await auditCase(caseId, AuditAction.EMAIL_FAILED, "email", template, "failed", "case not found");
    throw new Error(`case ${caseId} not found`);
  }

  const result = await sendEmailTemplate({
    toEmail: ctx.case.client.email,
    toName: ctx.case.client.fullName,
    caseCode: ctx.case.code,
    template,
    body: ctx.body,
  });

  if ("skipped" in result) {
    await auditCase(caseId, AuditAction.EMAIL_SENT, "email", template, "ok", "skipped (no credentials)");
    return { ok: true, skipped: true };
  }

  if (result.ok) {
    await auditCase(caseId, AuditAction.EMAIL_SENT, "email", template, "ok", `resend msg ${result.messageId}`);
    return { ok: true, messageId: result.messageId };
  }

  await auditCase(caseId, AuditAction.EMAIL_FAILED, "email", template, "failed", result.error);
  throw new Error(result.error);
}

// ── Lead-specific dispatch ──────────────────────────────────────────────

async function processLeadWhatsApp(payload: Extract<WhatsAppJob, { leadId: string }>) {
  const template = WHATSAPP_TEMPLATE_FOR_KIND[payload.kind];
  const lead = await loadLeadContext(payload.leadId);
  if (!lead) {
    await auditLead(payload.leadId, "whatsapp", template, "failed", "lead not found");
    throw new Error(`lead ${payload.leadId} not found`);
  }

  const result = await sendWhatsAppTemplate({
    toPhoneE164: lead.phone,
    template,
    variables: [lead.firstName, lead.meetingLabel, lead.abogadoName],
  });

  const stamp = stampFor(payload.kind);
  if ("skipped" in result) {
    await auditLead(payload.leadId, "whatsapp", template, "ok", "skipped (no credentials)");
    if (stamp) await markLeadStamp(payload.leadId, stamp);
    return { ok: true, skipped: true };
  }

  if (result.ok) {
    await auditLead(payload.leadId, "whatsapp", template, "ok", `meta msg ${result.messageId}`);
    if (stamp) await markLeadStamp(payload.leadId, stamp);
    return { ok: true, messageId: result.messageId };
  }

  await auditLead(payload.leadId, "whatsapp", template, "failed", result.error);
  throw new Error(result.error);
}

async function processLeadEmail(payload: Extract<EmailJob, { leadId: string }>) {
  const template = EMAIL_TEMPLATE_FOR_KIND[payload.kind];
  const lead = await loadLeadContext(payload.leadId);
  if (!lead) {
    await auditLead(payload.leadId, "email", template, "failed", "lead not found");
    throw new Error(`lead ${payload.leadId} not found`);
  }
  if (!lead.email) {
    await auditLead(payload.leadId, "email", template, "ok", "skipped (lead sin email)");
    return { ok: true, skipped: true };
  }

  const result = await sendEmailTemplate({
    toEmail: lead.email,
    toName: lead.fullName,
    caseCode: lead.publicCode,
    template,
    body: leadEmailBody(payload.kind, lead),
  });

  const stamp = stampFor(payload.kind);
  if ("skipped" in result) {
    await auditLead(payload.leadId, "email", template, "ok", "skipped (no credentials)");
    if (stamp) await markLeadStamp(payload.leadId, stamp);
    return { ok: true, skipped: true };
  }

  if (result.ok) {
    await auditLead(payload.leadId, "email", template, "ok", `resend msg ${result.messageId}`);
    if (stamp) await markLeadStamp(payload.leadId, stamp);
    return { ok: true, messageId: result.messageId };
  }

  await auditLead(payload.leadId, "email", template, "failed", result.error);
  throw new Error(result.error);
}

type LeadCtx = {
  fullName: string;
  firstName: string;
  email: string | null;
  phone: string;
  meetingAt: Date;
  meetingLabel: string;
  abogadoName: string;
  publicCode: string;
};

async function loadLeadContext(leadId: string): Promise<LeadCtx | null> {
  return withSystemRls(async (tx) => {
    const lead = await tx.lead.findUnique({
      where: { id: leadId },
      include: { assignedAbogado: { select: { fullName: true } } },
    });
    if (!lead) return null;
    const meetingLabel = lead.meetingAt.toLocaleString("es-CL", {
      dateStyle: "short",
      timeStyle: "short",
    });
    const fullName = lead.fullName;
    const firstName = fullName.split(" ")[0] ?? fullName;
    return {
      fullName,
      firstName,
      email: lead.email,
      phone: lead.phone,
      meetingAt: lead.meetingAt,
      meetingLabel,
      abogadoName: lead.assignedAbogado.fullName,
      publicCode: `LEAD-${lead.id.slice(0, 6).toUpperCase()}`,
    };
  });
}

function stampFor(kind: string): "confirmationSentAt" | "reminderSentAt" | null {
  if (kind === "lead_confirmation") return "confirmationSentAt";
  if (kind === "lead_reminder") return "reminderSentAt";
  return null;
}

async function markLeadStamp(leadId: string, field: "confirmationSentAt" | "reminderSentAt") {
  await withSystemRls((tx) =>
    tx.lead.update({
      where: { id: leadId },
      data: { [field]: new Date() },
    }),
  );
}

function leadEmailBody(kind: WhatsAppJob["kind"] | EmailJob["kind"], lead: LeadCtx): string {
  if (kind === "lead_confirmation") {
    return `Confirmamos su reunión con ${lead.abogadoName} el ${lead.meetingLabel}. Le enviaremos un recordatorio una hora antes.`;
  }
  if (kind === "lead_reminder") {
    return `Le recordamos que su reunión con ${lead.abogadoName} comienza a las ${lead.meetingLabel}. Por favor manténgase disponible.`;
  }
  if (kind === "lead_reassigned") {
    return `Su reunión del ${lead.meetingLabel} pasó a estar a cargo de ${lead.abogadoName}. Si necesita reprogramar, responda este mensaje.`;
  }
  return "";
}

async function auditCase(
  caseId: string,
  action: AuditAction,
  channel: "whatsapp" | "email",
  template: string,
  status: "ok" | "failed",
  message: string,
) {
  await withSystemRls((tx) =>
    tx.auditLog.create({
      data: { action, caseId, channel, template, status, message },
    }),
  );
}

async function auditLead(
  leadId: string,
  channel: "whatsapp" | "email",
  template: string,
  status: "ok" | "failed",
  message: string,
) {
  const action = channel === "whatsapp"
    ? (status === "ok" ? AuditAction.WHATSAPP_SENT : AuditAction.WHATSAPP_FAILED)
    : (status === "ok" ? AuditAction.EMAIL_SENT : AuditAction.EMAIL_FAILED);
  await withSystemRls((tx) =>
    tx.auditLog.create({
      data: {
        action,
        channel,
        template,
        status,
        message: `[lead:${leadId}] ${message}`,
      },
    }),
  );
}
