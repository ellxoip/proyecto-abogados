import prisma from '../lib/prisma.js';
import { outboxService } from '../services/outbox.service.js';
import { paymentService } from '../services/payment.service.js';
import { logger } from '../lib/logger.js';

const OUTBOX_WORKER_ENABLED = process.env.OUTBOX_WORKER_ENABLED !== 'false';

export function registerOutboxHandlers() {
  // payments.initial.paid.v1 — re-attempts SIS.CONTABLE and CRM sync if they previously failed.
  outboxService.registerHandler('payments.initial.paid.v1', async (_payload, aggregateId) => {
    const payment = await prisma.payment.findUnique({
      where: { id: aggregateId },
      include: { attempt: true },
    });
    if (!payment) {
      throw new Error(`Payment ${aggregateId} not found`);
    }

    const sisPending = ['pending', 'failed'].includes(payment.sis_contable_sync_status);
    const crmPending = ['pending', 'failed'].includes(payment.crm_sync_status);

    if (sisPending) {
      await paymentService.syncPaymentWithSisContable(payment, payment.attempt);
    }
    if (crmPending) {
      await paymentService.syncPaymentWithCrm(payment, payment.attempt);
    }

    // If both reached a terminal non-retry state (synced or skipped), the handler succeeds.
    const refreshed = await prisma.payment.findUnique({ where: { id: aggregateId } });
    if (!refreshed) throw new Error(`Payment ${aggregateId} disappeared`);

    const sisDone = ['synced', 'skipped'].includes(refreshed.sis_contable_sync_status);
    const crmDone = ['synced', 'skipped'].includes(refreshed.crm_sync_status);
    if (!sisDone || !crmDone) {
      throw new Error(`Sync still pending — sis=${refreshed.sis_contable_sync_status} crm=${refreshed.crm_sync_status}`);
    }
  });
}

export function startBackgroundWorkers() {
  if (!OUTBOX_WORKER_ENABLED) {
    logger.info('Outbox worker disabled via OUTBOX_WORKER_ENABLED=false');
    return;
  }
  outboxService.start();
}
