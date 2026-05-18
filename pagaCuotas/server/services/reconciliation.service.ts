import prisma from '../lib/prisma.js';
import { paymentService } from './payment.service.js';

const RECONCILIATION_BATCH_SIZE = 100;
const RECONCILIATION_MAX_BATCHES = 50; // Safety cap: up to 5000 payments per run

export class ReconciliationService {
  async runManualReconciliation() {
    const run = await prisma.reconciliationRun.create({ data: {} });
    const result = {
      payments_checked: 0,
      sis_retried: 0,
      crm_retried: 0,
      errors: [] as Array<{ payment_id: string; target: string; message: string }>,
    };

    try {
      let cursor: string | undefined;

      for (let batch = 0; batch < RECONCILIATION_MAX_BATCHES; batch++) {
        const payments = await prisma.payment.findMany({
          where: {
            status: 'confirmado',
            OR: [
              { sis_contable_sync_status: { in: ['pending', 'failed'] } },
              { crm_sync_status: { in: ['pending', 'failed'] } },
            ],
          },
          include: { attempt: true },
          orderBy: { created_at: 'asc' },
          take: RECONCILIATION_BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });

        if (payments.length === 0) break;
        cursor = payments[payments.length - 1].id;
        result.payments_checked += payments.length;

        for (const payment of payments) {
          if (['pending', 'failed'].includes(payment.sis_contable_sync_status)) {
            try {
              await paymentService.syncPaymentWithSisContable(payment, payment.attempt);
              result.sis_retried += 1;
            } catch (error: any) {
              result.errors.push({ payment_id: payment.id, target: 'sis_contable', message: error.message });
              await this.recordDeadLetter('sis_contable', 'payment.confirmed.sync', payment.id, payment, error.message);
            }
          }

          if (['pending', 'failed'].includes(payment.crm_sync_status)) {
            try {
              await paymentService.syncPaymentWithCrm(payment, payment.attempt);
              result.crm_retried += 1;
            } catch (error: any) {
              result.errors.push({ payment_id: payment.id, target: 'crm', message: error.message });
              await this.recordDeadLetter('crm', 'payment.confirmed.sync', payment.id, payment, error.message);
            }
          }
        }

        if (payments.length < RECONCILIATION_BATCH_SIZE) break;
      }

      await prisma.reconciliationRun.update({
        where: { id: run.id },
        data: {
          status: result.errors.length > 0 ? 'completed_with_errors' : 'completed',
          finished_at: new Date(),
          payments_checked: result.payments_checked,
          sis_retried: result.sis_retried,
          crm_retried: result.crm_retried,
          errors_count: result.errors.length,
          result_json: JSON.stringify(result),
        },
      });

      return { ok: true, run_id: run.id, ...result };
    } catch (error: any) {
      await prisma.reconciliationRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          finished_at: new Date(),
          errors_count: 1,
          result_json: JSON.stringify({ message: error.message }),
        },
      });
      throw error;
    }
  }

  private async recordDeadLetter(source: string, eventType: string, aggregateId: string, payload: unknown, errorMessage: string) {
    await prisma.deadLetterQueue.create({
      data: {
        source,
        event_type: eventType,
        aggregate_id: aggregateId,
        payload_json: JSON.stringify(payload),
        error_message: errorMessage,
      },
    });
  }
}

export const reconciliationService = new ReconciliationService();
