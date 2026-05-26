import crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';
import type {
  BillingCancelRequest,
  BillingCancelResponse,
  BillingIssueRequest,
  BillingIssueResponse,
  BillingStatusResponse,
  BillingEnvironment,
  BillingProviderName,
  IBillingProvider,
} from '../types.js';

export class AuthClBillingProvider implements IBillingProvider {
  readonly name: BillingProviderName = 'authcl';
  readonly environment: BillingEnvironment;

  private apiKey: string;
  private webhookSecret: string;
  private companyRut: string;
  private client: AxiosInstance;

  constructor(config: {
    environment: BillingEnvironment;
    baseUrl: string;
    apiKey: string;
    webhookSecret?: string;
    companyRut?: string;
  }) {
    this.environment = config.environment;
    this.apiKey = config.apiKey;
    this.webhookSecret = config.webhookSecret || '';
    this.companyRut = config.companyRut || '';
    this.client = axios.create({
      baseURL: config.baseUrl || 'https://api.auth.cl',
      timeout: 20000,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async issueDocument(request: BillingIssueRequest): Promise<BillingIssueResponse> {
    if (this.environment === 'sandbox' && this.isPlaceholderConfig()) return this.sandboxIssue(request);

    const response = await this.client.post('/v1/dte', {
      tipo: Number(request.sii_type),
      emisor: this.companyRut ? { rut: this.companyRut } : undefined,
      receptor: {
        rut: request.recipient.rut,
        razon_social: request.recipient.name,
        email: request.recipient.email,
      },
      detalle: request.items.map((item) => ({
        nombre: item.name,
        cantidad: item.quantity,
        precio: item.unit_price,
        monto: item.total,
      })),
      totales: {
        neto: request.amounts.net,
        iva: request.amounts.tax,
        total: request.amounts.total,
      },
      referencia_externa: request.external_reference,
      metadata: request.metadata || {},
    });

    return this.mapIssueResponse(response.data);
  }

  async getDocumentStatus(externalBillingId: string): Promise<BillingStatusResponse> {
    if (this.environment === 'sandbox' && externalBillingId.startsWith('authcl_sandbox_')) {
      return {
        external_billing_id: externalBillingId,
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        raw_response: { sandbox: true },
      };
    }

    const response = await this.client.get(`/v1/dte/${encodeURIComponent(externalBillingId)}`);
    const data = response.data;
    return {
      external_billing_id: String(data.id || data.external_billing_id || externalBillingId),
      status: this.mapStatus(data.status || data.estado_sii),
      folio: data.folio ? String(data.folio) : undefined,
      track_id: data.track_id ? String(data.track_id) : undefined,
      pdf_url: data.pdf_url || data.links?.pdf,
      xml_url: data.xml_url || data.links?.xml,
      accepted_at: data.accepted_at || data.fecha_aceptacion,
      error_message: data.error || data.message,
      raw_response: data,
    };
  }

  async cancelDocument(request: BillingCancelRequest): Promise<BillingCancelResponse> {
    if (this.environment === 'sandbox' && request.external_billing_id.startsWith('authcl_sandbox_')) {
      return { success: true, status: 'cancelled', raw_response: { sandbox: true, request } };
    }

    const response = await this.client.post(`/v1/dte/${encodeURIComponent(request.external_billing_id)}/cancel`, {
      reason: request.reason,
    });
    return {
      success: ['cancelled', 'anulado'].includes(String(response.data.status || response.data.estado).toLowerCase()),
      status: this.mapStatus(response.data.status || response.data.estado),
      raw_response: response.data,
    };
  }

  validateWebhookSignature(headers: Record<string, string>, body: unknown): boolean {
    if (this.environment === 'sandbox' && this.isPlaceholderConfig()) return true;
    if (!this.webhookSecret) return false;

    const signature = headers['x-authcl-signature'] || headers['x-signature'];
    if (!signature) return false;

    const payload = JSON.stringify(body || {});
    const expected = crypto.createHmac('sha256', this.webhookSecret).update(payload).digest('hex');
    const cleanSignature = String(signature).replace(/^sha256=/, '');
    if (expected.length !== cleanSignature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(cleanSignature));
  }

  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    const missing = this.isPlaceholderConfig();
    if (this.environment === 'production' && missing) {
      return { healthy: false, message: 'Auth.cl production credentials missing' };
    }
    return { healthy: true, message: `Auth.cl ${this.environment} configured` };
  }

  private mapIssueResponse(data: any): BillingIssueResponse {
    return {
      external_billing_id: String(data.id || data.external_billing_id || data.dte_id),
      folio: data.folio ? String(data.folio) : undefined,
      track_id: data.track_id ? String(data.track_id) : undefined,
      status: this.mapStatus(data.status || data.estado_sii),
      pdf_url: data.pdf_url || data.links?.pdf,
      xml_url: data.xml_url || data.links?.xml,
      issued_at: data.issued_at || data.fecha_emision,
      accepted_at: data.accepted_at || data.fecha_aceptacion,
      raw_response: data,
    };
  }

  private mapStatus(status: string): BillingIssueResponse['status'] {
    const normalized = String(status || '').toLowerCase();
    if (['accepted', 'aceptado', 'aceptada', 'sii_accepted'].includes(normalized)) return 'accepted';
    if (['rejected', 'rechazado', 'rechazada', 'sii_rejected'].includes(normalized)) return 'rejected';
    if (['cancelled', 'canceled', 'anulado', 'anulada'].includes(normalized)) return 'cancelled';
    if (['failed', 'error'].includes(normalized)) return 'failed';
    if (['submitted', 'enviado', 'enviada', 'processing'].includes(normalized)) return 'submitted';
    return 'submitted';
  }

  private isPlaceholderConfig() {
    return !this.apiKey || this.apiKey.includes('change_me') || this.apiKey.includes('sk_test_placeholder') || this.apiKey.startsWith('sandbox_');
  }

  private async sandboxIssue(request: BillingIssueRequest): Promise<BillingIssueResponse> {
    const id = `authcl_sandbox_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    return {
      external_billing_id: id,
      folio: String(Math.floor(100000 + Math.random() * 900000)),
      track_id: `track_${id}`,
      status: 'accepted',
      pdf_url: `/api/admin/billing-documents/${id}/pdf-placeholder`,
      xml_url: `/api/admin/billing-documents/${id}/xml-placeholder`,
      issued_at: new Date().toISOString(),
      accepted_at: new Date().toISOString(),
      raw_response: { sandbox: true, provider: 'authcl', request },
    };
  }
}
