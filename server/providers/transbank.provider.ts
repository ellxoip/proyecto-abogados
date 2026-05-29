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

export class TransbankProvider implements IPaymentProvider {
  readonly name: ProviderName = 'transbank';
  readonly environment: ProviderEnvironment;

  private commerceCode: string;
  private apiKey: string;
  private client: AxiosInstance;

  constructor(config: { environment: ProviderEnvironment; commerceCode: string; apiKey: string }) {
    this.environment = config.environment;
    this.commerceCode = config.commerceCode;
    this.apiKey = config.apiKey;
    const baseURL = config.environment === 'production'
      ? 'https://webpay3g.transbank.cl'
      : 'https://webpay3gint.transbank.cl';

    this.client = axios.create({
      baseURL,
      timeout: 20000,
      headers: {
        'Content-Type': 'application/json',
        'Tbk-Api-Key-Id': this.commerceCode,
        'Tbk-Api-Key-Secret': this.apiKey,
      },
    });
  }

  async createTransaction(request: ProviderCreateTransactionRequest): Promise<ProviderCreateTransactionResponse> {
    if (this.environment === 'sandbox' && this.isPlaceholderConfig()) return this.sandboxCreate(request);

    const response = await this.client.post('/rswebpaytransaction/api/webpay/v1.2/transactions', {
      buy_order: request.external_attempt_id.slice(0, 26),
      session_id: request.external_attempt_id,
      amount: Math.round(request.amount),
      return_url: `${request.return_url}?provider=transbank`,
    });

    return {
      provider_transaction_id: response.data.token,
      payment_url: `${response.data.url}?token_ws=${encodeURIComponent(response.data.token)}`,
      provider: this.name,
      raw_response: response.data,
    };
  }

  async confirmTransaction(token: string): Promise<ProviderConfirmTransactionResponse> {
    if (this.environment === 'sandbox' && token.startsWith('tbk_sandbox_')) return this.sandboxConfirm(token);

    const response = await this.client.put(`/rswebpaytransaction/api/webpay/v1.2/transactions/${encodeURIComponent(token)}`);
    const data = response.data;
    const approved = data.status === 'AUTHORIZED' && Number(data.response_code) === 0;

    return {
      approved,
      provider_transaction_id: token,
      authorization_code: data.authorization_code,
      payment_method: 'webpay',
      card_type: data.payment_type_code,
      card_last_four: data.card_detail?.card_number,
      installments: Number(data.installments_number || 1),
      amount: Number(data.amount || 0),
      status: approved ? 'approved' : 'rejected',
      reason: approved ? undefined : data.status || `response_code_${data.response_code}`,
      error_code: approved ? undefined : String(data.response_code ?? data.status),
      raw_response: data,
    };
  }

  async getTransactionStatus(providerTransactionId: string): Promise<ProviderTransactionStatus> {
    if (this.environment === 'sandbox' && providerTransactionId.startsWith('tbk_sandbox_')) {
      return { provider_transaction_id: providerTransactionId, status: 'approved', amount: 0, payment_method: 'webpay', raw_response: { sandbox: true } };
    }

    const response = await this.client.get(`/rswebpaytransaction/api/webpay/v1.2/transactions/${encodeURIComponent(providerTransactionId)}`);
    const data = response.data;
    const approved = data.status === 'AUTHORIZED' && Number(data.response_code) === 0;
    return {
      provider_transaction_id: providerTransactionId,
      status: approved ? 'approved' : data.status === 'REVERSED' ? 'refunded' : 'rejected',
      amount: Number(data.amount || 0),
      payment_method: 'webpay',
      raw_response: data,
    };
  }

  async refundTransaction(providerTransactionId: string, amount: number): Promise<ProviderRefundResponse> {
    if (this.environment === 'sandbox' && providerTransactionId.startsWith('tbk_sandbox_')) {
      return { success: true, provider_refund_id: `tbk_refund_${Date.now()}`, amount_refunded: amount, status: 'refunded', raw_response: { sandbox: true } };
    }

    const response = await this.client.post(`/rswebpaytransaction/api/webpay/v1.2/transactions/${encodeURIComponent(providerTransactionId)}/refunds`, {
      amount: Math.round(amount),
    });
    const data = response.data;
    return {
      success: ['REVERSED', 'NULLIFIED'].includes(data.type),
      provider_refund_id: data.authorization_code,
      amount_refunded: Number(data.nullified_amount || data.balance || amount),
      status: ['REVERSED', 'NULLIFIED'].includes(data.type) ? 'refunded' : 'pending',
      raw_response: data,
    };
  }

  validateWebhookSignature(_headers: Record<string, string>, _body: unknown): boolean {
    return true;
  }

  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    const missing = this.isPlaceholderConfig();
    if (this.environment === 'production' && missing) {
      return { healthy: false, message: 'Transbank production credentials missing' };
    }
    return { healthy: true, message: `Transbank ${this.environment} configured` };
  }

  private isPlaceholderConfig() {
    return !this.commerceCode || !this.apiKey || this.commerceCode.includes('5970') || this.apiKey.includes('change_me');
  }

  private async sandboxCreate(request: ProviderCreateTransactionRequest): Promise<ProviderCreateTransactionResponse> {
    const token = `tbk_sandbox_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    return {
      provider_transaction_id: token,
      payment_url: `${request.return_url}?provider=transbank&token=${token}`,
      provider: this.name,
      raw_response: { sandbox: true, token, buy_order: request.external_attempt_id },
    };
  }

  private async sandboxConfirm(token: string): Promise<ProviderConfirmTransactionResponse> {
    return {
      approved: true,
      provider_transaction_id: token,
      authorization_code: `TBK_AUTH_${Math.floor(Math.random() * 999999)}`,
      payment_method: 'webpay',
      card_type: 'VD',
      card_last_four: '6623',
      installments: 1,
      amount: 0,
      status: 'approved',
      raw_response: { sandbox: true, status: 'AUTHORIZED', response_code: 0 },
    };
  }
}
