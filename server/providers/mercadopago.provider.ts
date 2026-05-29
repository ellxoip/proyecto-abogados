import crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';
import type {
  IPaymentProvider,
  ProviderName,
  ProviderEnvironment,
  ProviderCreateTransactionRequest,
  ProviderCreateTransactionResponse,
  ProviderConfirmTransactionResponse,
  ProviderRefundResponse,
  ProviderTransactionStatus,
} from './types.js';

export class MercadoPagoProvider implements IPaymentProvider {
  readonly name: ProviderName = 'mercadopago';
  readonly environment: ProviderEnvironment;

  private accessToken: string;
  private publicKey: string;
  private webhookSecret: string;
  private client: AxiosInstance;

  constructor(config: {
    environment: ProviderEnvironment;
    accessToken: string;
    publicKey: string;
    webhookSecret?: string;
  }) {
    this.environment = config.environment;
    this.accessToken = config.accessToken;
    this.publicKey = config.publicKey;
    this.webhookSecret = config.webhookSecret || '';
    this.client = axios.create({
      baseURL: 'https://api.mercadopago.com',
      timeout: 20000,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async createTransaction(request: ProviderCreateTransactionRequest): Promise<ProviderCreateTransactionResponse> {
    if (this.environment === 'sandbox') return this.sandboxCreate(request);

    const response = await this.client.post('/checkout/preferences', {
      items: [
        {
          title: request.description,
          quantity: 1,
          unit_price: Math.round(request.amount),
          currency_id: request.currency || 'CLP',
        },
      ],
      external_reference: request.external_attempt_id,
      back_urls: {
        success: `${request.return_url}?provider=mercadopago`,
        failure: `${request.cancel_url}?provider=mercadopago`,
        pending: `${request.return_url}?provider=mercadopago&pending=true`,
      },
      notification_url: `${request.notification_url}/mercadopago`,
      metadata: request.metadata || {},
      payer: request.customer_email ? { email: request.customer_email, name: request.customer_name } : undefined,
      auto_return: 'approved',
    });

    return {
      provider_transaction_id: response.data.id,
      payment_url: response.data.init_point,
      provider: this.name,
      raw_response: response.data,
    };
  }

  async confirmTransaction(token: string): Promise<ProviderConfirmTransactionResponse> {
    if (this.environment === 'sandbox') return this.sandboxConfirm(token);

    const response = await this.client.get(`/v1/payments/${encodeURIComponent(token)}`);
    return this.mapPaymentResponse(token, response.data);
  }

  async getTransactionStatus(providerTransactionId: string): Promise<ProviderTransactionStatus> {
    if (this.environment === 'sandbox') {
      return {
        provider_transaction_id: providerTransactionId,
        status: 'approved',
        amount: 0,
        payment_method: 'credit_card',
        raw_response: { sandbox: true },
      };
    }

    const response = await this.client.get(`/v1/payments/${encodeURIComponent(providerTransactionId)}`);
    const mapped = this.mapPaymentResponse(providerTransactionId, response.data);
    return {
      provider_transaction_id: providerTransactionId,
      status: mapped.approved ? 'approved' : mapped.status === 'pending' ? 'pending' : 'rejected',
      amount: mapped.amount,
      payment_method: mapped.payment_method,
      raw_response: response.data,
    };
  }

  async refundTransaction(providerTransactionId: string, amount: number): Promise<ProviderRefundResponse> {
    if (this.environment === 'sandbox') {
      return {
        success: true,
        provider_refund_id: `mp_refund_sandbox_${Date.now()}`,
        amount_refunded: amount,
        status: 'refunded',
        raw_response: { sandbox: true },
      };
    }

    const response = await this.client.post(`/v1/payments/${encodeURIComponent(providerTransactionId)}/refunds`, {
      amount,
    });

    return {
      success: ['approved', 'refunded'].includes(response.data?.status),
      provider_refund_id: String(response.data?.id || ''),
      amount_refunded: Number(response.data?.amount || amount),
      status: ['approved', 'refunded'].includes(response.data?.status) ? 'refunded' : 'pending',
      raw_response: response.data,
    };
  }

  validateWebhookSignature(headers: Record<string, string>, body: any): boolean {
    if (this.environment === 'sandbox') return true;
    if (!this.webhookSecret) return false;

    const xSignature = headers['x-signature'];
    const xRequestId = headers['x-request-id'];
    if (!xSignature || !xRequestId) return false;

    const parts = Object.fromEntries(
      xSignature.split(',').map((part) => {
        const [key, value] = part.split('=');
        return [key?.trim(), value?.trim()];
      })
    );
    const ts = parts.ts;
    const hash = parts.v1;
    const dataId = String(body?.query?.['data.id'] || body?.query?.id || body?.data?.id || '').toLowerCase();
    if (!ts || !hash || !dataId) return false;

    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const expected = crypto.createHmac('sha256', this.webhookSecret).update(manifest).digest('hex');
    if (expected.length !== hash.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
  }

  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    if (this.environment === 'production') {
      const missing = !this.accessToken || this.accessToken.startsWith('TEST-') || !this.webhookSecret;
      return {
        healthy: !missing,
        message: missing
          ? 'MercadoPago production access token/webhook secret are not configured'
          : `MercadoPago production mode - Public Key: ${this.publicKey.slice(0, 8)}...`,
      };
    }

    return {
      healthy: true,
      message: `MercadoPago ${this.environment} mode - Public Key: ${this.publicKey.slice(0, 8)}...`,
    };
  }

  private mapPaymentResponse(token: string, data: any): ProviderConfirmTransactionResponse {
    const approved = data?.status === 'approved';
    return {
      approved,
      provider_transaction_id: String(data?.id || token),
      authorization_code: data?.authorization_code,
      payment_method: data?.payment_method_id || data?.payment_type_id,
      card_type: data?.payment_method_id,
      card_last_four: data?.card?.last_four_digits,
      installments: Number(data?.installments || 1),
      amount: Number(data?.transaction_amount || data?.amount || 0),
      status: approved ? 'approved' : data?.status === 'pending' ? 'pending' : 'rejected',
      reason: approved ? undefined : data?.status_detail || data?.status,
      error_code: approved ? undefined : data?.status_detail,
      raw_response: data,
    };
  }

  private async sandboxCreate(request: ProviderCreateTransactionRequest): Promise<ProviderCreateTransactionResponse> {
    const preferenceId = `mp_sandbox_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

    return {
      provider_transaction_id: preferenceId,
      payment_url: `${request.return_url}?provider=mercadopago&preference_id=${preferenceId}&source=mercadopago`,
      provider: this.name,
      raw_response: {
        sandbox: true,
        id: preferenceId,
        init_point: `https://sandbox.mercadopago.cl/checkout/v1/redirect?pref_id=${preferenceId}`,
        external_reference: request.external_attempt_id,
      },
    };
  }

  private async sandboxConfirm(token: string): Promise<ProviderConfirmTransactionResponse> {
    return {
      approved: true,
      provider_transaction_id: token,
      authorization_code: `MP_AUTH_${Math.floor(Math.random() * 999999)}`,
      payment_method: 'credit_card',
      card_type: 'MASTERCARD',
      card_last_four: '8831',
      installments: 1,
      amount: 0,
      status: 'approved',
      raw_response: {
        sandbox: true,
        status: 'approved',
        status_detail: 'accredited',
        payment_type_id: 'credit_card',
      },
    };
  }
}
