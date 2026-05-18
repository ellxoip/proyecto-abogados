import prisma from '../lib/prisma.js';
import { sisContableClient } from '../clients/sisContable.client.js';
import { billingProviderRegistry } from '../billing/index.js';
import { logger } from '../lib/logger.js';
import { normalizeIdentifier } from '../lib/clientAuth.js';
import type { BillingDocumentType, BillingIssueRequest, BillingProviderName } from '../billing/types.js';

const IVA_RATE = 0.19;

export class BillingService {
  isEnabled() {
    return process.env.BILLING_ENABLED === 'true';
  }

  shouldAutoIssue() {
    return this.isEnabled() && process.env.BILLING_AUTO_ISSUE_ON_PAYMENT !== 'false';
  }

  async issueForPayment(paymentId: string, options?: { document_type?: BillingDocumentType; provider?: BillingProviderName }) {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { attempt: true, billing_documents: true } });
    if (!payment) throw { status: 404, message: 'Payment not found', code: 'PAYMENT_NOT_FOUND' };
    if (payment.status !== 'confirmado') throw { status: 400, message: 'Only confirmed payments can be billed', code: 'PAYMENT_NOT_CONFIRMED' };

    const existing = payment.billing_documents.find((doc) => !['failed', 'rejected', 'cancelled'].includes(doc.status));
    if (existing) return existing;

    const providerName = options?.provider || (process.env.BILLING_PROVIDER as BillingProviderName) || 'authcl';
    const provider = billingProviderRegistry.get(providerName);
    const crmProfile = await this.resolveCrmProfile(payment);
    const documentType = options?.document_type || this.resolveDocumentType(payment, crmProfile);
    const siiType = this.resolveSiiType(documentType);
    const total = Math.round(Number(payment.amount));
    const amounts = this.calculateAmounts(total, documentType);
    const recipient = await this.resolveRecipient(payment, crmProfile, documentType);

    const request: BillingIssueRequest = {
      external_reference: payment.external_payment_id,
      document_type: documentType,
      sii_type: siiType,
      recipient,
      amounts,
      items: [{
        name: `Pago cuotas contrato ${payment.contrato_contable_id}`,
        quantity: 1,
        unit_price: total,
        total,
      }],
      metadata: {
        payment_id: payment.id,
        external_payment_id: payment.external_payment_id,
        external_attempt_id: payment.attempt.external_attempt_id,
        provider_transaction_id: payment.provider_transaction_id,
        contrato_id: payment.contrato_contable_id,
        cuota_ids: JSON.parse(payment.attempt.cuota_ids_json),
      },
    };

    const draft = await prisma.billingDocument.create({
      data: {
        payment_id: payment.id,
        provider: provider.name,
        document_type: documentType,
        sii_type: siiType,
        status: 'pending',
        recipient_rut: recipient.rut,
        recipient_name: recipient.name,
        recipient_email: recipient.email || null,
        net_amount: amounts.net,
        tax_amount: amounts.tax,
        total_amount: amounts.total,
        request_payload_json: JSON.stringify(request),
      },
    });

    await prisma.payment.update({
      where: { id: payment.id },
      data: { billing_status: 'pending', billing_document_id: draft.id },
    });

    try {
      const response = await provider.issueDocument(request);
      const updated = await prisma.billingDocument.update({
        where: { id: draft.id },
        data: {
          external_billing_id: response.external_billing_id,
          folio: response.folio || null,
          track_id: response.track_id || null,
          status: response.status,
          pdf_url: response.pdf_url || null,
          xml_url: response.xml_url || null,
          response_payload_json: JSON.stringify(response.raw_response),
          issued_at: response.issued_at ? new Date(response.issued_at) : new Date(),
          accepted_at: response.accepted_at ? new Date(response.accepted_at) : null,
        },
      });
      await prisma.payment.update({ where: { id: payment.id }, data: { billing_status: response.status } });
      return updated;
    } catch (error: any) {
      await prisma.billingDocument.update({
        where: { id: draft.id },
        data: { status: 'failed', error_message: error.message, retry_count: { increment: 1 } },
      });
      await prisma.payment.update({ where: { id: payment.id }, data: { billing_status: 'failed' } });
      throw error;
    }
  }

  async retryDocument(documentId: string) {
    const document = await prisma.billingDocument.findUnique({ where: { id: documentId }, include: { payment: true } });
    if (!document) throw { status: 404, message: 'Billing document not found', code: 'BILLING_DOCUMENT_NOT_FOUND' };
    return this.issueForPayment(document.payment_id, {
      document_type: document.document_type as BillingDocumentType,
      provider: document.provider as BillingProviderName,
    });
  }

  async listDocuments(query: { page?: number; limit?: number; status?: string; provider?: string }) {
    const page = Number(query.page || 1);
    const limit = Math.min(Number(query.limit || 20), 100);
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.provider) where.provider = query.provider;

    const [data, total] = await Promise.all([
      prisma.billingDocument.findMany({ where, orderBy: { created_at: 'desc' }, skip: (page - 1) * limit, take: limit, include: { payment: true } }),
      prisma.billingDocument.count({ where }),
    ]);

    return { ok: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async handleWebhook(providerName: BillingProviderName, headers: Record<string, string>, body: any) {
    const provider = billingProviderRegistry.get(providerName);
    if (!provider.validateWebhookSignature(headers, body)) {
      throw { status: 401, message: 'Invalid billing webhook signature', code: 'INVALID_BILLING_WEBHOOK_SIGNATURE' };
    }

    const externalBillingId = String(body?.id || body?.external_billing_id || body?.dte_id || body?.document_id || '');
    if (!externalBillingId) throw { status: 400, message: 'Missing billing document id', code: 'MISSING_BILLING_ID' };

    const status = await provider.getDocumentStatus(externalBillingId);
    const document = await prisma.billingDocument.findFirst({ where: { external_billing_id: externalBillingId } });
    if (!document) throw { status: 404, message: 'Billing document not found', code: 'BILLING_DOCUMENT_NOT_FOUND' };

    const updated = await prisma.billingDocument.update({
      where: { id: document.id },
      data: {
        status: status.status,
        folio: status.folio || document.folio,
        track_id: status.track_id || document.track_id,
        pdf_url: status.pdf_url || document.pdf_url,
        xml_url: status.xml_url || document.xml_url,
        accepted_at: status.accepted_at ? new Date(status.accepted_at) : document.accepted_at,
        error_message: status.error_message || null,
        provider_payload_json: JSON.stringify(body),
        response_payload_json: JSON.stringify(status.raw_response),
      },
    });

    await prisma.payment.update({
      where: { id: document.payment_id },
      data: { billing_status: status.status, billing_document_id: document.id },
    });

    return updated;
  }

  async health() {
    return {
      enabled: this.isEnabled(),
      environment: billingProviderRegistry.getEnvironment(),
      providers: billingProviderRegistry.getConfigSummary(),
      health: await billingProviderRegistry.healthCheckAll(),
    };
  }

  private resolveDocumentType(payment: any, crmProfile: any): BillingDocumentType {
    const configured = process.env.BILLING_DEFAULT_DOCUMENT_TYPE as BillingDocumentType | undefined;
    const invoiceForCompany = process.env.BILLING_INVOICE_FOR_COMPANY === 'true';
    if (invoiceForCompany && (crmProfile?.rut_empresa || crmProfile?.empresa)) return 'factura';
    if (configured) return configured;
    const identifier = payment.attempt?.cliente_identifier || payment.cliente_contable_id || '';
    return identifier.includes('-') ? 'boleta' : 'boleta';
  }

  private resolveSiiType(documentType: BillingDocumentType) {
    const map: Record<BillingDocumentType, string> = {
      boleta: '39',
      boleta_exenta: '41',
      factura: '33',
      factura_exenta: '34',
      nota_credito: '61',
    };
    return map[documentType];
  }

  private calculateAmounts(total: number, documentType: BillingDocumentType) {
    if (['boleta_exenta', 'factura_exenta'].includes(documentType)) {
      return { net: total, tax: 0, total };
    }
    const net = Math.round(total / (1 + IVA_RATE));
    return { net, tax: total - net, total };
  }

  private async resolveCrmProfile(payment: any) {
    const identifier = payment.attempt?.cliente_identifier;
    if (!identifier) return null;

    try {
      return await prisma.crmClientProfile.findUnique({
        where: { identifier: normalizeIdentifier(identifier) },
      });
    } catch (error: any) {
      logger.warn('Billing CRM profile lookup failed', { paymentId: payment.id, error: error.message });
      return null;
    }
  }

  private async resolveRecipient(payment: any, crmProfile: any, documentType: BillingDocumentType): Promise<BillingIssueRequest['recipient']> {
    if (documentType === 'factura' || documentType === 'factura_exenta') {
      return {
        rut: crmProfile?.rut_empresa || crmProfile?.rut || payment.attempt?.cliente_identifier || payment.cliente_contable_id,
        name: crmProfile?.empresa || crmProfile?.nombre || 'Cliente Empresa',
        email: crmProfile?.email || undefined,
      };
    }

    try {
      const debts = await sisContableClient.getDebtsByIdentifier(payment.cliente_contable_id);
      return {
        rut: debts.cliente?.rut || payment.cliente_contable_id,
        name: debts.cliente?.nombre || 'Cliente PagaCuotas',
        email: debts.cliente?.email || undefined,
      };
    } catch (error: any) {
      logger.warn('Billing recipient fallback used', { paymentId: payment.id, error: error.message });
      return {
        rut: payment.attempt?.cliente_identifier || payment.cliente_contable_id,
        name: 'Cliente PagaCuotas',
      };
    }
  }
}

export const billingService = new BillingService();
