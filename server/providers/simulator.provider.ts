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

export class SimulatorProvider implements IPaymentProvider {
  readonly name: ProviderName = 'simulator';
  readonly environment: ProviderEnvironment = 'sandbox';

  private transactions = new Map<string, {
    request: ProviderCreateTransactionRequest;
    status: 'pending' | 'approved' | 'rejected' | 'refunded';
  }>();

  private simulatedDelay: number;

  constructor(options?: { delayMs?: number }) {
    this.simulatedDelay = options?.delayMs ?? 500;
  }

  async createTransaction(request: ProviderCreateTransactionRequest): Promise<ProviderCreateTransactionResponse> {
    await this.delay();

    const providerTxId = `sim_txn_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    this.transactions.set(providerTxId, { request, status: 'pending' });

    return {
      provider_transaction_id: providerTxId,
      payment_url: `${request.return_url}?provider=simulator&token=${providerTxId}&simulated=true`,
      provider: this.name,
      raw_response: {
        simulated: true,
        provider_transaction_id: providerTxId,
        external_attempt_id: request.external_attempt_id,
      },
    };
  }

  async confirmTransaction(token: string): Promise<ProviderConfirmTransactionResponse> {
    await this.delay();

    const txn = this.transactions.get(token);
    if (!txn) {
      return {
        approved: false,
        provider_transaction_id: token,
        amount: 0,
        status: 'error',
        reason: 'Transaction not found in simulator',
        error_code: 'SIM_NOT_FOUND',
        raw_response: { simulated: true, error: 'not_found' },
      };
    }

    const outcome = this.determineOutcome(txn.request.amount);
    txn.status = outcome.approved ? 'approved' : 'rejected';

    return {
      approved: outcome.approved,
      provider_transaction_id: token,
      authorization_code: outcome.approved ? `SIM_AUTH_${Math.floor(Math.random() * 999999)}` : undefined,
      payment_method: 'pago_prueba_pagacuotas',
      card_type: 'SIM',
      card_last_four: '4242',
      installments: 1,
      amount: txn.request.amount,
      status: outcome.approved ? 'approved' : 'rejected',
      reason: outcome.reason,
      error_code: outcome.errorCode,
      raw_response: {
        simulated: true,
        external_attempt_id: txn.request.external_attempt_id,
        outcome: outcome.approved ? 'approved' : 'rejected',
        rule: outcome.rule,
      },
    };
  }

  async getTransactionStatus(providerTransactionId: string): Promise<ProviderTransactionStatus> {
    await this.delay();
    const txn = this.transactions.get(providerTransactionId);

    if (!txn) {
      return {
        provider_transaction_id: providerTransactionId,
        status: 'error',
        amount: 0,
        raw_response: { simulated: true, error: 'not_found' },
      };
    }

    return {
      provider_transaction_id: providerTransactionId,
      status: txn.status === 'pending' ? 'pending' : txn.status,
      amount: txn.request.amount,
      payment_method: 'pago_prueba_pagacuotas',
      raw_response: { simulated: true, status: txn.status },
    };
  }

  async refundTransaction(providerTransactionId: string, amount: number): Promise<ProviderRefundResponse> {
    await this.delay();
    const txn = this.transactions.get(providerTransactionId);

    if (!txn || txn.status !== 'approved') {
      return {
        success: false,
        amount_refunded: 0,
        status: 'failed',
        reason: txn ? 'Transaction not in approved state' : 'Transaction not found',
        raw_response: { simulated: true },
      };
    }

    txn.status = 'refunded';
    return {
      success: true,
      provider_refund_id: `sim_refund_${Date.now()}`,
      amount_refunded: amount,
      status: 'refunded',
      raw_response: { simulated: true, refunded: true },
    };
  }

  validateWebhookSignature(): boolean {
    return true;
  }

  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    return { healthy: true, message: 'PagaCuotas simulator enabled for sandbox payments' };
  }

  private determineOutcome(amount: number): { approved: boolean; reason?: string; errorCode?: string; rule: string } {
    const lastTwoDigits = amount % 100;
    if (lastTwoDigits === 99) return { approved: false, reason: 'Fondos insuficientes (simulado)', errorCode: 'SIM_INSUFFICIENT_FUNDS', rule: 'amount_ends_99' };
    if (lastTwoDigits === 88) return { approved: false, reason: 'Tarjeta bloqueada (simulado)', errorCode: 'SIM_CARD_BLOCKED', rule: 'amount_ends_88' };
    if (lastTwoDigits === 77) return { approved: false, reason: 'Error de comunicacion (simulado)', errorCode: 'SIM_COMM_ERROR', rule: 'amount_ends_77' };
    return { approved: true, rule: 'default_approve' };
  }

  private delay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.simulatedDelay));
  }
}
