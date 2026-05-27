import prisma from '../lib/prisma.js';
import { paymentService } from './payment.service.js';
import { logger } from '../lib/logger.js';

const MAX_RETRY_ATTEMPTS = 5;

export class PaymentNotificationService {

  /**
   * Retry all failed sync notifications to SIS.CONTABLE and CRM.
   * Call this from a cron job or manual admin endpoint.
   */
  async retryAllFailed(): Promise<{
    sis_contable: { retried: number; succeeded: number; failed: number };
    crm: { retried: number; succeeded: number; failed: number };
    reversals: { retried: number; succeeded: number; failed: number };
  }> {
    logger.info('Starting retry of failed payment notifications');

    const sisResult = await this.retrySisContablePayments();
    const crmResult = await this.retryCrmPayments();
    const reversalResult = await this.retrySisContableReversals();

    logger.info('Retry of failed payment notifications completed', {
      sisContable: sisResult,
      crm: crmResult,
      reversals: reversalResult,
    });

    return {
      sis_contable: sisResult,
      crm: crmResult,
      reversals: reversalResult,
    };
  }

  // ===========================================================
  // Retry failed SIS.CONTABLE payment confirmations
  // ===========================================================
  private async retrySisContablePayments() {
    const failedPayments = await prisma.payment.findMany({
      where: {
        sis_contable_sync_status: 'failed',
        sis_contable_retry_count: { lt: MAX_RETRY_ATTEMPTS },
        status: 'confirmado',
      },
      include: { attempt: true },
    });

    let succeeded = 0;
    let failed = 0;

    for (const payment of failedPayments) {
      try {
        logger.info('Retrying SIS.CONTABLE payment sync', { externalPaymentId: payment.external_payment_id });
        await paymentService.syncPaymentWithSisContable(payment, payment.attempt);
        succeeded++;
      } catch {
        failed++;
      }
    }

    return { retried: failedPayments.length, succeeded, failed };
  }

  // ===========================================================
  // Retry failed CRM payment notifications
  // ===========================================================
  private async retryCrmPayments() {
    const failedPayments = await prisma.payment.findMany({
      where: {
        crm_sync_status: 'failed',
        crm_retry_count: { lt: MAX_RETRY_ATTEMPTS },
        status: 'confirmado',
      },
      include: { attempt: true },
    });

    let succeeded = 0;
    let failed = 0;

    for (const payment of failedPayments) {
      try {
        logger.info('Retrying CRM payment sync', { externalPaymentId: payment.external_payment_id });
        await paymentService.syncPaymentWithCrm(payment, payment.attempt);
        succeeded++;
      } catch {
        failed++;
      }
    }

    return { retried: failedPayments.length, succeeded, failed };
  }

  // ===========================================================
  // Retry failed SIS.CONTABLE reversal notifications
  // ===========================================================
  private async retrySisContableReversals() {
    const failedReversals = await prisma.paymentReversal.findMany({
      where: {
        sis_contable_sync_status: 'failed',
      },
      include: { payment: { include: { attempt: true } } },
    });

    let succeeded = 0;
    let failed = 0;

    for (const reversal of failedReversals) {
      try {
        logger.info('Retrying SIS.CONTABLE reversal sync', { externalReversalId: reversal.external_reversal_id });
        const { sisContableClient } = await import('../clients/sisContable.client');

        await sisContableClient.notifyPaymentReversed({
          external_reversal_id: reversal.external_reversal_id,
          external_payment_id: reversal.external_payment_id,
          external_attempt_id: reversal.external_attempt_id,
          provider: reversal.provider,
          cliente_id: reversal.cliente_contable_id,
          contrato_id: reversal.contrato_contable_id,
          cuota_ids: reversal.cuota_ids_json as string[],
          monto_reversado: Number(reversal.amount_reversed),
          fecha_reversa: reversal.reversed_at.toISOString(),
          reason: reversal.reason || 'Retry',
        });

        await prisma.paymentReversal.update({
          where: { id: reversal.id },
          data: { sis_contable_sync_status: 'synced', sis_contable_error: null },
        });
        succeeded++;
      } catch (err: any) {
        await prisma.paymentReversal.update({
          where: { id: reversal.id },
          data: { sis_contable_error: err.message },
        });
        failed++;
      }
    }

    return { retried: failedReversals.length, succeeded, failed };
  }
}

export const paymentNotificationService = new PaymentNotificationService();
