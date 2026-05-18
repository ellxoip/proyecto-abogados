/**
 * Notification dispatch surface.
 *
 * Local development with Redis can use BullMQ queues. Vercel/serverless runs
 * inline so the production app works from the same URL without a second port
 * or persistent worker process.
 */

export type WhatsAppJob =
  | { kind: "case_update"; caseId: string; updateId: string }
  | { kind: "public_comment"; caseId: string; commentId: string }
  | { kind: "non_payment_warning"; caseId: string }
  | { kind: "initial_invoice"; caseId: string }
  | { kind: "payment_receipt"; caseId: string }
  | { kind: "overdue_notice"; caseId: string }
  | { kind: "case_finished"; caseId: string }
  | { kind: "client_credentials"; caseId: string }
  | { kind: "lead_confirmation"; leadId: string }
  | { kind: "lead_reminder"; leadId: string }
  | { kind: "lead_reassigned"; leadId: string };

export type EmailJob =
  | { kind: "case_update"; caseId: string; updateId: string }
  | { kind: "public_comment"; caseId: string; commentId: string }
  | { kind: "non_payment_warning"; caseId: string }
  | { kind: "initial_invoice"; caseId: string }
  | { kind: "payment_receipt"; caseId: string }
  | { kind: "overdue_notice"; caseId: string }
  | { kind: "case_finished"; caseId: string }
  | { kind: "client_credentials"; caseId: string }
  | { kind: "lead_confirmation"; leadId: string }
  | { kind: "lead_reminder"; leadId: string }
  | { kind: "lead_reassigned"; leadId: string };

function shouldRunInline() {
  return process.env.PROCESSING_MODE === "inline" || process.env.VERCEL === "1";
}

export async function enqueueWhatsApp(job: WhatsAppJob): Promise<void> {
  if (shouldRunInline()) {
    const { processWhatsAppJob } = await import("@/lib/processing/dispatch");
    await processWhatsAppJob(job);
    console.info("[whatsapp:inline:processed]", job);
    return;
  }

  const { whatsappQueue } = await import("./queue");
  await whatsappQueue.add("whatsapp-job", job, {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
  });
  console.info("[whatsapp:queue:enqueued]", job);
}

export async function enqueueEmail(job: EmailJob): Promise<void> {
  if (shouldRunInline()) {
    const { processEmailJob } = await import("@/lib/processing/dispatch");
    await processEmailJob(job);
    console.info("[email:inline:processed]", job);
    return;
  }

  const { emailQueue } = await import("./queue");
  await emailQueue.add("email-job", job, {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
  });
  console.info("[email:queue:enqueued]", job);
}
