import prisma from '../lib/prisma.js';
import type { Prisma } from '@prisma/client';
import { sisContableClient } from '../clients/sisContable.client.js';
import { crmClient } from '../clients/crm.client.js';
import { providerRegistry } from '../providers/index.js';
import { outboxService } from './outbox.service.js';
import { billingService } from './billing.service.js';
import { logger } from '../lib/logger.js';
import type { IPaymentProvider, ProviderName } from '../providers/types.js';
import type {
  CreatePaymentIntentRequest,
  WebhookProviderPayload,
  ReversalWebhookPayload,
  PaymentConfirmedPayload,
  PaymentRejectedPayload,
  PaymentReversedPayload,
  CrmPaymentNotification,
  SisContableDebtResponse,
  SisContableInstallmentsResponse,
} from '../types/index.js';

const APP_URL = process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:4000');

export class PaymentService {

  // ===========================================================
  // 1. Consultar deuda de un cliente
  // ===========================================================
  async getDebts(identifier: string): Promise<SisContableDebtResponse> {
    try {
      return await sisContableClient.getDebtsByIdentifier(identifier);
    } catch (error: any) {
      if (error.code === 'CLIENT_NOT_FOUND' || error.details?.code === 'CLIENT_NOT_FOUND') {
        throw { message: 'Cliente no encontrado', status: 404, code: 'CLIENT_NOT_FOUND' };
      }
      throw error;
    }
  }

  // ===========================================================
  // 2. Consultar cuotas por contrato
  // ===========================================================
  async getContractInstallments(contratoId: string): Promise<SisContableInstallmentsResponse> {
    try {
      return await sisContableClient.getContractInstallments(contratoId);
    } catch (error: any) {
      if (error.code === 'CONTRACT_NOT_FOUND' || error.details?.code === 'CONTRACT_NOT_FOUND') {
        throw { message: 'Contrato no encontrado', status: 404, code: 'CONTRACT_NOT_FOUND' };
      }
      throw error;
    }
  }

  // ===========================================================
  // 3. Crear intención de pago (validación + proveedor real)
  // ===========================================================
  async createPaymentIntent(data: CreatePaymentIntentRequest) {
    const external_attempt_id = `pc_attempt_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    // Step 1: Validate with SIS.CONTABLE (endpoint 3.3)
    const validation = await sisContableClient.validatePaymentIntent({
      external_attempt_id,
      cliente_id: data.cliente_contable_id,
      contrato_id: data.contrato_contable_id,
      cuota_ids: data.cuota_ids,
      monto_total: data.amount,
    });

    if (!validation.valid) {
      throw {
        message: (validation as any).message || 'Intención de pago rechazada por SIS.CONTABLE',
        status: 400,
        code: (validation as any).code,
        details: validation,
      };
    }

    // Step 2: Resolve payment provider (validator already enforces 'mercadopago')
    const providerName = data.provider as ProviderName;
    const provider: IPaymentProvider = providerRegistry.get(providerName);
    if (providerRegistry.getEnvironment() === 'production' && provider.name === 'simulator') {
      throw {
        message: `El proveedor ${provider.name} no esta habilitado para cobros productivos.`,
        status: 400,
        code: 'PROVIDER_NOT_ALLOWED_IN_PRODUCTION',
      };
    }

    // Step 3: Create transaction with the provider
    const providerResponse = await provider.createTransaction({
      external_attempt_id,
      amount: data.amount,
      currency: 'CLP',
      description: `Pago cuotas — Contrato ${data.contrato_contable_id}`,
      return_url: `${APP_URL}/api/payments/callback`,
      cancel_url: `${APP_URL}/api/payments/cancel`,
      notification_url: `${APP_URL}/api/webhooks/payment-provider`,
      metadata: {
        cliente_id: data.cliente_contable_id,
        contrato_id: data.contrato_contable_id,
        cuota_ids: data.cuota_ids,
      },
    });

    // Step 4: Persist attempt locally
    const attempt = await prisma.paymentAttempt.create({
      data: {
        external_attempt_id,
        cliente_identifier: data.identifier,
        cliente_contable_id: data.cliente_contable_id,
        contrato_contable_id: data.contrato_contable_id,
        cuota_ids_json: data.cuota_ids,
        amount: data.amount,
        provider: provider.name,
        status: 'iniciado',
        validation_status: validation.status,
        validation_expires_at: validation.expires_at ? new Date(validation.expires_at) : null,
        sis_contable_sync_status: 'synced',
        provider_transaction_id: providerResponse.provider_transaction_id,
        request_payload_json: providerResponse.raw_response ?? null,
      },
    });

    return {
      attempt_id: attempt.id,
      external_attempt_id,
      provider: provider.name,
      provider_environment: provider.environment,
      provider_transaction_id: providerResponse.provider_transaction_id,
      payment_url: providerResponse.payment_url,
      expires_at: validation.expires_at,
    };
  }

  // ===========================================================
  // 4. Callback del proveedor (confirm after redirect)
  // ===========================================================
  async processProviderCallback(token: string, providerName?: string) {
    // Find attempt by provider_transaction_id
    let attempt = await prisma.paymentAttempt.findFirst({
      where: { provider_transaction_id: token },
    });

    if (!attempt && providerName === 'mercadopago') {
      const provider = providerRegistry.get('mercadopago');
      const confirmation = await provider.confirmTransaction(token);
      const externalAttemptId = String(confirmation.raw_response?.external_reference || '');
      if (externalAttemptId) {
        attempt = await prisma.paymentAttempt.findUnique({ where: { external_attempt_id: externalAttemptId } });
        if (attempt) {
          await prisma.paymentAttempt.update({
            where: { id: attempt.id },
            data: { provider_transaction_id: confirmation.provider_transaction_id },
          });
          return confirmation.approved
            ? this.processApprovedPayment(attempt, {
                external_attempt_id: attempt.external_attempt_id,
                provider_transaction_id: confirmation.provider_transaction_id,
                status: 'approved',
                amount: confirmation.amount || Number(attempt.amount),
                method: confirmation.payment_method,
                authorization_code: confirmation.authorization_code,
              })
            : this.processRejectedPayment(attempt, {
                external_attempt_id: attempt.external_attempt_id,
                provider_transaction_id: confirmation.provider_transaction_id,
                status: 'rejected',
                amount: Number(attempt.amount),
                error_message: confirmation.reason,
                error_code: confirmation.error_code,
              });
        }
      }
    }

    if (!attempt) {
      throw { message: 'Transaction not found', status: 404, code: 'TRANSACTION_NOT_FOUND' };
    }

    // Get provider and confirm
    const resolvedName = (providerName || attempt.provider || 'simulator') as ProviderName;
    const provider = providerRegistry.get(resolvedName);
    const confirmation = await provider.confirmTransaction(token);

    // Update attempt with provider response
    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        response_payload_json: confirmation.raw_response ?? null,
        method: confirmation.payment_method || null,
      },
    });

    if (confirmation.approved) {
      return this.processApprovedPayment(attempt, {
        external_attempt_id: attempt.external_attempt_id,
        provider_transaction_id: confirmation.provider_transaction_id,
        status: 'approved',
        amount: confirmation.amount || Number(attempt.amount),
        method: confirmation.payment_method,
        authorization_code: confirmation.authorization_code,
      });
    } else {
      return this.processRejectedPayment(attempt, {
        external_attempt_id: attempt.external_attempt_id,
        provider_transaction_id: confirmation.provider_transaction_id,
        status: 'rejected',
        amount: Number(attempt.amount),
        error_message: confirmation.reason,
        error_code: confirmation.error_code,
      });
    }
  }

  // ===========================================================
  // 5. Procesar webhook del proveedor
  // ===========================================================
  async processWebhook(providerData: WebhookProviderPayload) {
    const { external_attempt_id, status } = providerData;

    const attempt = await prisma.paymentAttempt.findUnique({
      where: { external_attempt_id },
    });

    if (!attempt) {
      throw { message: 'Payment attempt not found', status: 404, code: 'ATTEMPT_NOT_FOUND' };
    }

    if (status === 'approved') {
      return this.processApprovedPayment(attempt, providerData);
    } else {
      return this.processRejectedPayment(attempt, providerData);
    }
  }

  async processProviderWebhook(providerName: string, headers: Record<string, string>, body: any, query: any) {
    const provider = providerRegistry.get(providerName as ProviderName);
    const signedBody = { ...body, query };
    if (!provider.validateWebhookSignature(headers, signedBody)) {
      throw { message: 'Invalid webhook signature', status: 401, code: 'INVALID_WEBHOOK_SIGNATURE' };
    }

    const paymentId = providerName === 'mercadopago'
      ? String(query?.['data.id'] || query?.id || body?.data?.id || body?.id || '')
      : String(body?.token || query?.token || body?.token_ws || query?.token_ws || body?.provider_transaction_id || '');
    if (!paymentId) {
      throw { message: 'Missing provider payment id', status: 400, code: 'MISSING_PAYMENT_ID' };
    }

    const confirmation = await provider.confirmTransaction(paymentId);
    const externalAttemptId = String(confirmation.raw_response?.external_reference || '');
    const attempt = externalAttemptId
      ? await prisma.paymentAttempt.findUnique({ where: { external_attempt_id: externalAttemptId } })
      : await prisma.paymentAttempt.findFirst({ where: { provider_transaction_id: paymentId } });

    if (!attempt) {
      throw { message: 'Payment attempt not found', status: 404, code: 'ATTEMPT_NOT_FOUND' };
    }

    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        provider_transaction_id: confirmation.provider_transaction_id,
        response_payload_json: confirmation.raw_response ?? null,
        method: confirmation.payment_method || null,
      },
    });

    if (confirmation.approved) {
      return this.processApprovedPayment(attempt, {
        external_attempt_id: attempt.external_attempt_id,
        provider_transaction_id: confirmation.provider_transaction_id,
        status: 'approved',
        amount: confirmation.amount || Number(attempt.amount),
        method: confirmation.payment_method,
        authorization_code: confirmation.authorization_code,
      });
    }

    if (confirmation.status === 'pending') {
      return { status: 'pending', external_attempt_id: attempt.external_attempt_id };
    }

    return this.processRejectedPayment(attempt, {
      external_attempt_id: attempt.external_attempt_id,
      provider_transaction_id: confirmation.provider_transaction_id,
      status: 'rejected',
      amount: Number(attempt.amount),
      error_message: confirmation.reason,
      error_code: confirmation.error_code,
    });
  }

  // ===========================================================
  // 5a. Pago APROBADO
  // ===========================================================
  private async processApprovedPayment(attempt: any, providerData: WebhookProviderPayload) {
    // Idempotency
    const existing = await prisma.payment.findFirst({
      where: { payment_attempt_id: attempt.id },
    });
    if (existing) {
      logger.info('Payment attempt already processed', { externalAttemptId: attempt.external_attempt_id });
      return existing;
    }

    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: 'confirmado',
        provider_transaction_id: providerData.provider_transaction_id,
        method: providerData.method || null,
        provider_payload_json: providerData as unknown as Prisma.InputJsonValue,
      },
    });

    const external_payment_id = `pc_pay_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const cuotaIds = attempt.cuota_ids_json as string[];

    const transactionNumber = providerData.authorization_code || providerData.provider_transaction_id;
    const receiptUrl = attempt.provider === 'mercadopago'
      ? `https://www.mercadopago.cl/payments/${providerData.provider_transaction_id}/ticket`
      : null;

    const payment = await prisma.payment.create({
      data: {
        external_payment_id,
        payment_attempt_id: attempt.id,
        cliente_contable_id: attempt.cliente_contable_id,
        contrato_contable_id: attempt.contrato_contable_id,
        provider: attempt.provider,
        provider_transaction_id: providerData.provider_transaction_id,
        transaction_number: transactionNumber,
        amount: attempt.amount,
        method: providerData.method || null,
        status: 'confirmado',
        paid_at: new Date(),
        receipt_url: receiptUrl,
        raw_provider_payload_json: providerData as unknown as Prisma.InputJsonValue,
      },
    });

    // Non-blocking syncs
    outboxService.enqueue({
      eventType: 'payments.initial.paid.v1',
      aggregateType: 'payment',
      aggregateId: payment.id,
      idempotencyKey: `payment-confirmed:${payment.external_payment_id}`,
      payload: {
        external_payment_id: payment.external_payment_id,
        external_attempt_id: attempt.external_attempt_id,
        cliente_id: payment.cliente_contable_id,
        contrato_id: payment.contrato_contable_id,
        cuota_ids: cuotaIds,
        amount: Number(payment.amount),
      },
    }).catch((e) => logger.error('Payment outbox enqueue failed', { error: e.message }));
    this.syncPaymentWithSisContable(payment, attempt, cuotaIds).catch((e) =>
      logger.error('Payment SIS.CONTABLE sync deferred', { externalPaymentId: payment.external_payment_id, error: e.message }));
    this.syncPaymentWithCrm(payment, attempt).catch((e) =>
      logger.error('Payment CRM sync deferred', { externalPaymentId: payment.external_payment_id, error: e.message }));
    if (billingService.shouldAutoIssue()) {
      billingService.issueForPayment(payment.id).catch((e) =>
        logger.error('Payment billing issue deferred', { externalPaymentId: payment.external_payment_id, error: e.message }));
    }

    return payment;
  }

  // ===========================================================
  // 5b. Pago RECHAZADO
  // ===========================================================
  private async processRejectedPayment(attempt: any, providerData: WebhookProviderPayload) {
    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: 'rechazado',
        provider_transaction_id: providerData.provider_transaction_id || null,
        provider_payload_json: providerData as unknown as Prisma.InputJsonValue,
      },
    });

    const cuotaIds = attempt.cuota_ids_json as string[];

    const payload: PaymentRejectedPayload = {
      external_attempt_id: attempt.external_attempt_id,
      provider: attempt.provider,
      cliente_id: attempt.cliente_contable_id,
      contrato_id: attempt.contrato_contable_id,
      cuota_ids: cuotaIds,
      monto_total: Number(attempt.amount),
      reason: providerData.error_message || 'Pago rechazado por el proveedor',
      provider_status: providerData.status.toUpperCase(),
      fecha_evento: new Date().toISOString(),
      metadata: { provider_error_code: providerData.error_code || null },
    };

    try {
      await sisContableClient.notifyPaymentRejected(payload);
      await prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: { sis_contable_sync_status: 'synced' },
      });
    } catch (error: any) {
      logger.error('Payment rejection SIS.CONTABLE sync failed', {
        externalAttemptId: attempt.external_attempt_id,
        error: error.message,
      });
      await prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: { sis_contable_sync_status: 'failed', sis_contable_error: error.message },
      });
    }

    return { status: 'rejected', external_attempt_id: attempt.external_attempt_id };
  }

  // ===========================================================
  // 6. Procesar REVERSA
  // ===========================================================
  async processReversal(reversalData: ReversalWebhookPayload) {
    const { external_payment_id, provider_transaction_id, amount, reason, provider_reversal_code } = reversalData;

    const payment = await prisma.payment.findFirst({
      where: { OR: [{ external_payment_id }, { provider_transaction_id }] },
      include: { attempt: true },
    });

    if (!payment) {
      throw { message: 'Pago original no encontrado para reversa', status: 404, code: 'PAYMENT_NOT_FOUND' };
    }

    // Idempotency
    const existing = await prisma.paymentReversal.findFirst({
      where: { external_payment_id: payment.external_payment_id },
    });
    if (existing) return existing;

    const cuotaIds = payment.attempt.cuota_ids_json as string[];
    const external_reversal_id = `pc_rev_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'reversado' } });
    await prisma.paymentAttempt.update({ where: { id: payment.attempt.id }, data: { status: 'reversado' } });

    const reversal = await prisma.paymentReversal.create({
      data: {
        external_reversal_id,
        external_payment_id: payment.external_payment_id,
        external_attempt_id: payment.attempt.external_attempt_id,
        payment_id: payment.id,
        cliente_contable_id: payment.cliente_contable_id,
        contrato_contable_id: payment.contrato_contable_id,
        provider: payment.provider,
        cuota_ids_json: cuotaIds,
        amount_reversed: amount,
        reason,
        provider_reversal_code: provider_reversal_code || null,
        reversed_at: new Date(),
      },
    });

    // Also request refund from provider if available
    try {
      const provider = providerRegistry.get(payment.provider as ProviderName);
      if (payment.provider_transaction_id) {
        await provider.refundTransaction(payment.provider_transaction_id, amount);
      }
    } catch (e: any) {
      logger.warn('Provider refund attempt failed', {
        externalPaymentId: payment.external_payment_id,
        error: e.message,
      });
    }

    const reversedPayload: PaymentReversedPayload = {
      external_reversal_id,
      external_payment_id: payment.external_payment_id,
      external_attempt_id: payment.attempt.external_attempt_id,
      provider: payment.provider,
      cliente_id: payment.cliente_contable_id,
      contrato_id: payment.contrato_contable_id,
      cuota_ids: cuotaIds,
      monto_reversado: amount,
      fecha_reversa: new Date().toISOString(),
      reason,
      metadata: { provider_reversal_code },
    };

    try {
      await sisContableClient.notifyPaymentReversed(reversedPayload);
      await prisma.paymentReversal.update({
        where: { id: reversal.id },
        data: { sis_contable_sync_status: 'synced' },
      });
    } catch (error: any) {
      await prisma.paymentReversal.update({
        where: { id: reversal.id },
        data: { sis_contable_sync_status: 'failed', sis_contable_error: error.message },
      });
    }

    return reversal;
  }

  // ===========================================================
  // Sync: Payment → SIS.CONTABLE
  // ===========================================================
  async syncPaymentWithSisContable(payment: any, attempt: any, cuotaIds?: string[]) {
    const ids = cuotaIds || attempt.cuota_ids_json as string[];

    const payload: PaymentConfirmedPayload = {
      external_payment_id: payment.external_payment_id,
      external_attempt_id: attempt.external_attempt_id,
      identifier: attempt.cliente_identifier || attempt.cliente_contable_id,
      provider: payment.provider,
      cliente_id: payment.cliente_contable_id,
      contrato_id: payment.contrato_contable_id,
      cuota_ids: ids,
      monto_pagado: Number(payment.amount),
      fecha_pago: payment.paid_at?.toISOString() || new Date().toISOString(),
      metadata: { provider_transaction_id: payment.provider_transaction_id, method: payment.method },
    };

    try {
      await sisContableClient.notifyPaymentConfirmed(payload);
      await prisma.payment.update({
        where: { id: payment.id },
        data: { sis_contable_sync_status: 'synced', sis_contable_error: null, sis_contable_retry_count: { increment: 1 } },
      });
    } catch (error: any) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { sis_contable_sync_status: 'failed', sis_contable_error: error.message, sis_contable_retry_count: { increment: 1 } },
      });
      throw error;
    }
  }

  // ===========================================================
  // Sync: Payment → CRM
  // ===========================================================
  async syncPaymentWithCrm(payment: any, attempt: any) {
    try {
      let clienteName = '';
      let servicio = '';
      try {
        const debts = await sisContableClient.getDebtsByIdentifier(payment.cliente_contable_id);
        clienteName = debts.cliente?.nombre || '';
        const contrato = debts.contratos?.find((c: any) => c.id === payment.contrato_contable_id);
        servicio = contrato?.servicio || '';
      } catch { /* non-critical */ }

      const cuotaIds = attempt.cuota_ids_json as string[];

      const notification: CrmPaymentNotification = {
        external_payment_id: payment.external_payment_id,
        cliente_rut: payment.cliente_contable_id,
        cliente_nombre: clienteName,
        contrato_id: payment.contrato_contable_id,
        servicio,
        monto_pagado: Number(payment.amount),
        fecha_pago: payment.paid_at?.toISOString() || new Date().toISOString(),
        provider: payment.provider,
        method: payment.method || undefined,
        cuotas_pagadas: cuotaIds.length,
      };

      await crmClient.notifyPaymentConfirmed(notification);
      await prisma.payment.update({
        where: { id: payment.id },
        data: { crm_sync_status: 'synced', crm_sync_error: null, crm_retry_count: { increment: 1 } },
      });
    } catch (error: any) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { crm_sync_status: 'failed', crm_sync_error: error.message, crm_retry_count: { increment: 1 } },
      });
      throw error;
    }
  }
}

export const paymentService = new PaymentService();
