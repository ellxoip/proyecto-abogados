import { CaseStage, LeadStatus, NotificationType, Role } from "@prisma/client";
import { checkCaseHealth } from "@/lib/case-health";
import { withSystemRls } from "@/lib/rls";
import { enqueueEmail, enqueueWhatsApp } from "@/lib/notifications";

export async function runHealthSweep() {
  const casesToCheck = await withSystemRls(async (tx) => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    return tx.case.findMany({
      where: {
        stage: { in: [CaseStage.OPEN, CaseStage.IN_PROGRESS, CaseStage.WAITING_CUOTAS] },
        OR: [{ last_health_check_at: { lt: oneHourAgo } }, { last_health_check_at: null }],
      },
      select: { id: true },
    });
  });

  let processed = 0;
  let failed = 0;

  for (const c of casesToCheck) {
    try {
      await withSystemRls(async (tx) => {
        await checkCaseHealth(tx, c.id);
      });
      processed++;
    } catch {
      failed++;
    }
  }

  return { checked: casesToCheck.length, processed, failed };
}

export async function runExecutioner() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  return withSystemRls(async (tx) => {
    const stale = await tx.case.findMany({
      where: {
        stage: CaseStage.OPEN,
        is_paid: false,
        createdAt: { lt: cutoff },
      },
      select: { id: true },
    });

    for (const c of stale) {
      await tx.case.update({
        where: { id: c.id },
        data: {
          stage: CaseStage.WAITING_CUOTAS,
          halted_reason: "Boleta inicial sin pago confirmado (>24h)",
          halted_at: new Date(),
        },
      });
    }

    return { processed: stale.length };
  });
}

/**
 * Sweeper de leads (compatible con Vercel Cron + worker BullMQ).
 *  - Manda recordatorio 1h antes a leads activos sin reminderSentAt.
 *  - Detecta leads PENDING próximos a su reunión sin contacto y notifica al
 *    jefe + superadmin para reasignación.
 */
export async function runLeadSweep() {
  const now = new Date();
  const reminderHorizon = new Date(now.getTime() + 60 * 60 * 1000);
  const stuckHorizon = new Date(now.getTime() + 30 * 60 * 1000);

  let remindersSent = 0;
  let stuckFlagged = 0;

  const upcoming = await withSystemRls((tx) =>
    tx.lead.findMany({
      where: {
        meetingAt: { gt: now, lte: reminderHorizon },
        reminderSentAt: null,
        status: { in: [LeadStatus.PENDING, LeadStatus.CONFIRMED, LeadStatus.CONTACTED] },
      },
      select: { id: true },
    }),
  );

  for (const l of upcoming) {
    await Promise.allSettled([
      enqueueWhatsApp({ kind: "lead_reminder", leadId: l.id }),
      enqueueEmail({ kind: "lead_reminder", leadId: l.id }),
    ]);
    remindersSent++;
  }

  const stuck = await withSystemRls((tx) =>
    tx.lead.findMany({
      where: {
        meetingAt: { gt: now, lte: stuckHorizon },
        status: LeadStatus.PENDING,
        contactedAt: null,
        stuckNotifiedAt: null,
      },
      include: {
        assignedAbogado: { select: { id: true, fullName: true, managedById: true } },
      },
    }),
  );

  if (stuck.length > 0) {
    await withSystemRls(async (tx) => {
      const supervisors = await tx.user.findMany({
        where: { role: { in: [Role.SUPER_ADMIN, Role.JEFE_DE_MESA] }, active: true },
        select: { id: true, role: true },
      });
      const superadmins = supervisors.filter((s) => s.role === Role.SUPER_ADMIN).map((s) => s.id);

      for (const lead of stuck) {
        const targets = new Set<string>(superadmins);
        if (lead.assignedAbogado.managedById) targets.add(lead.assignedAbogado.managedById);

        for (const userId of targets) {
          await tx.notification.create({
            data: {
              userId,
              type: NotificationType.LEAD_NUEVO,
              title: `Lead sin respuesta: ${lead.fullName}`,
              body: `${lead.assignedAbogado.fullName} no contactó al lead y la reunión es a las ${lead.meetingAt.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}. Reasigná desde la Agenda.`,
              leadId: lead.id,
            },
          });
        }

        await tx.lead.update({
          where: { id: lead.id },
          data: { stuckNotifiedAt: new Date() },
        });
        stuckFlagged++;
      }
    });
  }

  return { remindersSent, stuckFlagged, scanned: upcoming.length + stuck.length };
}
