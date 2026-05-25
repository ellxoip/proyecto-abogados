import axios, { AxiosInstance, AxiosError } from 'axios';
import dotenv from 'dotenv';
import type {
  SisContableDebtResponse,
  SisContableRawDebtResponse,
  SisContableInstallmentsResponse,
  SisContableRawInstallmentsResponse,
  PaymentIntentValidateRequest,
  PaymentIntentValidateResponse,
  PaymentConfirmedPayload,
  PaymentConfirmedResponse,
  PaymentRejectedPayload,
  PaymentRejectedResponse,
  PaymentReversedPayload,
  PaymentReversedResponse,
  CaseUpdatesResponse,
  IntegrationError,
} from '../types/index.js';
import prisma from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import {
  authenticateLocalClient,
  confirmLocalPayment,
  findLocalDebt,
  findLocalInstallments,
  rejectLocalPayment,
  reverseLocalPayment,
  updateLocalClientPassword,
  validateLocalPaymentIntent,
} from '../fixtures/localSisContable.fixture.js';

dotenv.config();

const SIS_CONTABLE_BASE_URL = process.env.SIS_CONTABLE_BASE_URL || 'http://localhost:3001';
const SIS_CONTABLE_API_KEY = process.env.SIS_CONTABLE_API_KEY || '';
const SIS_CONTABLE_BEARER_TOKEN = process.env.SIS_CONTABLE_BEARER_TOKEN || '';
const SIS_CONTABLE_AUTH_METHOD = process.env.SIS_CONTABLE_AUTH_METHOD || 'api_key'; // api_key | bearer

// Local fixtures: simulan respuestas de SIS.CONTABLE para desarrollo sin DB real.
// Producción debe SIEMPRE hablar contra hive-financial-control real, así que el flag
// se ignora cuando NODE_ENV === "production" o PAYMENT_ENVIRONMENT === "production".
const IS_PROD =
  process.env.NODE_ENV === 'production' ||
  process.env.PAYMENT_ENVIRONMENT === 'production';
const REQUESTED_LOCAL_FIXTURES = process.env.SIS_CONTABLE_LOCAL_FIXTURES === 'true';
const SIS_CONTABLE_LOCAL_FIXTURES = REQUESTED_LOCAL_FIXTURES && !IS_PROD;

if (REQUESTED_LOCAL_FIXTURES && IS_PROD) {
  // eslint-disable-next-line no-console
  console.error(
    '[sisContable.client] SIS_CONTABLE_LOCAL_FIXTURES=true ignorado en producción. ' +
      'Las fixtures locales NUNCA deben usarse en prod; verificar configuración de ENV.',
  );
}

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

export class SisContableClient {
  private client: AxiosInstance;

  constructor() {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Dual auth support
    if (SIS_CONTABLE_AUTH_METHOD === 'bearer' && SIS_CONTABLE_BEARER_TOKEN) {
      headers['Authorization'] = `Bearer ${SIS_CONTABLE_BEARER_TOKEN}`;
    } else if (SIS_CONTABLE_API_KEY) {
      headers['x-api-key'] = SIS_CONTABLE_API_KEY;
    }

    this.client = axios.create({
      baseURL: SIS_CONTABLE_BASE_URL,
      headers,
      timeout: 15000,
    });
  }

  // ===========================================================
  // 3.1 — Consultar deuda por cliente
  // ===========================================================
  async getDebtsByIdentifier(identifier: string): Promise<SisContableDebtResponse> {
    if (SIS_CONTABLE_LOCAL_FIXTURES) {
      const localDebt = findLocalDebt(identifier);
      if (localDebt) return localDebt;
    }

    const response = await this.requestWithLog<SisContableRawDebtResponse>(
      'GET',
      `/api/integrations/pagacuotas/deudas/${encodeURIComponent(identifier)}`,
      undefined,
      'get_debts'
    );
    return this.normalizeDebtResponse(response);
  }

  async loginClient(identifier: string, password: string): Promise<{ cliente: SisContableDebtResponse['cliente']; debts: SisContableDebtResponse }> {
    if (SIS_CONTABLE_LOCAL_FIXTURES) {
      const localSession = authenticateLocalClient(identifier, password);
      if (localSession) return localSession;
      throw {
        message: 'Credenciales invalidas.',
        status: 401,
        code: 'CLIENT_INVALID_CREDENTIALS',
      } as IntegrationError;
    }

    const response = await this.requestWithLog<any>(
      'POST',
      '/api/integrations/pagacuotas/client-login',
      { identifier, password },
      'client_login'
    );
    return {
      cliente: {
        id: String(response.cliente?.id || ''),
        rut: String(response.cliente?.rut || ''),
        nombre: String(response.cliente?.nombre || ''),
        email: String(response.cliente?.email || ''),
        telefono: String(response.cliente?.telefono || ''),
      },
      debts: this.normalizeDebtResponse(response.debts),
    };
  }

  async updateClientPassword(identifier: string, currentPassword: string, newPassword: string): Promise<void> {
    if (SIS_CONTABLE_LOCAL_FIXTURES) {
      if (updateLocalClientPassword(identifier, currentPassword) && /^[a-zA-Z0-9]{6}$/.test(newPassword)) return;
      throw {
        message: 'Credenciales invalidas.',
        status: 401,
        code: 'CLIENT_INVALID_CREDENTIALS',
      } as IntegrationError;
    }

    await this.requestWithLog<any>(
      'PATCH',
      '/api/integrations/pagacuotas/client-login',
      { identifier, currentPassword, newPassword },
      'client_password_update'
    );
  }

  async setClientPasswordFromAutoLogin(identifier: string, newPassword: string): Promise<void> {
    if (SIS_CONTABLE_LOCAL_FIXTURES) {
      if (findLocalDebt(identifier) && /^[a-zA-Z0-9]{6}$/.test(newPassword)) return;
      throw {
        message: 'Credenciales invalidas.',
        status: 401,
        code: 'CLIENT_INVALID_CREDENTIALS',
      } as IntegrationError;
    }

    await this.requestWithLog<any>(
      'PATCH',
      '/api/integrations/pagacuotas/client-login',
      { identifier, newPassword, autoLoginPasswordChange: true },
      'client_password_update_auto_login'
    );
  }

  // ===========================================================
  // 3.2 — Consultar cuotas por contrato
  // ===========================================================
  async getContractInstallments(contratoId: string): Promise<SisContableInstallmentsResponse> {
    if (SIS_CONTABLE_LOCAL_FIXTURES) {
      const localInstallments = findLocalInstallments(contratoId);
      if (localInstallments) return localInstallments;
    }

    const response = await this.requestWithLog<SisContableRawInstallmentsResponse>(
      'GET',
      `/api/integrations/pagacuotas/contratos/${encodeURIComponent(contratoId)}/cuotas`,
      undefined,
      'get_contract_installments'
    );
    return this.normalizeInstallmentsResponse(contratoId, response);
  }

  // ===========================================================
  // 3.3 — Validar intención de pago
  // ===========================================================
  async validatePaymentIntent(payload: PaymentIntentValidateRequest): Promise<PaymentIntentValidateResponse> {
    if (SIS_CONTABLE_LOCAL_FIXTURES) {
      const localValidation = validateLocalPaymentIntent(payload);
      if (localValidation) return localValidation;
    }

    const response = await this.requestWithLog<any>(
      'POST',
      '/api/integrations/pagacuotas/payment-intents/validate',
      payload,
      'validate_payment_intent'
    );
    return this.normalizeValidationResponse(payload, response);
  }

  // ===========================================================
  // 3.4 — Confirmar pago
  // ===========================================================
  async notifyPaymentConfirmed(payload: PaymentConfirmedPayload): Promise<PaymentConfirmedResponse> {
    if (SIS_CONTABLE_LOCAL_FIXTURES) {
      const localConfirmation = confirmLocalPayment(payload);
      if (localConfirmation) return localConfirmation;
    }

    return this.requestWithRetry<PaymentConfirmedResponse>(
      'POST',
      '/api/integrations/pagacuotas/payments/confirmed',
      payload,
      'notify_payment_confirmed'
    );
  }

  // ===========================================================
  // 3.5 — Registrar pago rechazado
  // ===========================================================
  async notifyPaymentRejected(payload: PaymentRejectedPayload): Promise<PaymentRejectedResponse> {
    if (SIS_CONTABLE_LOCAL_FIXTURES) {
      const localRejection = rejectLocalPayment(payload);
      if (localRejection) return localRejection;
    }

    return this.requestWithRetry<PaymentRejectedResponse>(
      'POST',
      '/api/integrations/pagacuotas/payments/rejected',
      payload,
      'notify_payment_rejected'
    );
  }

  // ===========================================================
  // 3.6 — Registrar reversa de pago
  // ===========================================================
  async notifyPaymentReversed(payload: PaymentReversedPayload): Promise<PaymentReversedResponse> {
    if (SIS_CONTABLE_LOCAL_FIXTURES) {
      const localReversal = reverseLocalPayment(payload);
      if (localReversal) return localReversal;
    }

    return this.requestWithRetry<PaymentReversedResponse>(
      'POST',
      '/api/integrations/pagacuotas/payments/reversed',
      payload,
      'notify_payment_reversed'
    );
  }

  // ===========================================================
  // Internal: Request with automatic IntegrationLog
  // ===========================================================
  private async requestWithLog<T>(
    method: 'GET' | 'POST' | 'PATCH',
    endpoint: string,
    payload?: any,
    eventType?: string
  ): Promise<T> {
    const startTime = Date.now();

    // Log outbound request
    await this.logIntegration('outbound', eventType || endpoint, endpoint, method, payload);

    try {
      const response = method === 'GET'
        ? await this.client.get<T>(endpoint)
        : method === 'PATCH'
          ? await this.client.patch<T>(endpoint, payload)
          : await this.client.post<T>(endpoint, payload);

      const duration = Date.now() - startTime;

      // Log inbound response
      await this.logIntegration(
        'inbound', `${eventType}_response`, endpoint, method,
        null, response.data, response.status, duration
      );

      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      const axiosErr = error as AxiosError;
      const errMessage = axiosErr.response?.data
        ? JSON.stringify(axiosErr.response.data)
        : axiosErr.message;

      await this.logIntegration(
        'inbound', `${eventType}_error`, endpoint, method,
        payload, axiosErr.response?.data, axiosErr.response?.status, duration, errMessage
      );

      this.throwFormattedError(eventType || endpoint, axiosErr);
    }
  }

  // ===========================================================
  // Internal: Request with retry + backoff (for critical writes)
  // ===========================================================
  private async requestWithRetry<T>(
    method: 'POST',
    endpoint: string,
    payload: any,
    eventType: string
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.requestWithLog<T>(method, endpoint, payload, eventType);
      } catch (error: any) {
        lastError = error;
        const isRetryable = !error.status || error.status >= 500;

        if (!isRetryable || attempt === MAX_RETRIES) {
          throw error;
        }

        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        logger.warn('SIS.CONTABLE request retry scheduled', {
          eventType,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          delayMs: delay,
          status: error.status || 'network_error',
        });
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  // ===========================================================
  // Helpers
  // ===========================================================
  private throwFormattedError(method: string, error: AxiosError): never {
    const responseData = error.response?.data as any;
    throw {
      message: responseData?.message || `Error communicating with SIS.CONTABLE in ${method}`,
      status: error.response?.status || 500,
      details: responseData || error.message,
      code: responseData?.code || 'SIS_CONTABLE_ERROR',
    } as IntegrationError;
  }

  private normalizeDebtResponse(response: SisContableRawDebtResponse): SisContableDebtResponse {
    const resumenDeuda = response.resumen_deuda || {};
    const resumen = response.resumen || {};
    const contratosSource = response.contratos || response.contratos_activos || [];
    const totalPendiente = Number(resumen.total_deuda ?? resumenDeuda.monto_pendiente ?? response.monto_pendiente ?? 0);
    const totalVencido = Number(resumen.total_vencido ?? resumenDeuda.monto_vencido ?? response.monto_vencido ?? 0);

    const contratos = contratosSource.map((contract: any) => ({
      id: String(contract.id),
      servicio: String(contract.servicio || contract.tipo_servicio || `Contrato ${contract.id}`),
      estado: String(contract.estado || 'ACTIVO'),
      total_cuotas: Number(contract.total_cuotas || 0),
      cuotas_pagadas: Number(contract.cuotas_pagadas || 0),
      cuotas_pendientes: Number(contract.cuotas_pendientes || 0),
      cuotas_vencidas: Number(contract.cuotas_vencidas || 0),
      monto_pendiente: Number(contract.monto_pendiente || 0),
      monto_vencido: Number(contract.monto_vencido || 0),
    }));

    return {
      cliente: {
        id: String(response.cliente?.id || ''),
        rut: String(response.cliente?.rut || ''),
        nombre: String(response.cliente?.nombre || ''),
        email: String(response.cliente?.email || ''),
        telefono: String(response.cliente?.telefono || ''),
      },
      resumen: {
        total_deuda: totalPendiente,
        total_vencido: totalVencido,
        total_por_vencer: Math.max(totalPendiente - totalVencido, 0),
        contratos_activos: Number(resumen.contratos_activos ?? contratos.length),
        cuotas_totales: Number(resumen.cuotas_totales ?? resumenDeuda.total_cuotas ?? response.total_cuotas ?? 0),
        cuotas_pagadas: Number(resumen.cuotas_pagadas ?? resumenDeuda.cuotas_pagadas ?? response.cuotas_pagadas ?? 0),
        cuotas_pendientes: Number(resumen.cuotas_pendientes ?? resumenDeuda.cuotas_pendientes ?? response.cuotas_pendientes ?? 0),
        cuotas_vencidas: Number(resumen.cuotas_vencidas ?? 0),
      },
      contratos,
    };
  }

  private normalizeInstallmentsResponse(
    contratoId: string,
    response: SisContableRawInstallmentsResponse
  ): SisContableInstallmentsResponse {
    const cuotas = (response.cuotas || []).map((cuota: any) => ({
      id: String(cuota.id),
      numero: Number(cuota.numero ?? cuota.numero_cuota ?? 0),
      monto: Number(cuota.monto ?? cuota.monto_actual ?? 0),
      monto_pagado: Number(cuota.monto_pagado ?? 0),
      saldo: Number(cuota.saldo ?? cuota.saldo_pendiente ?? 0),
      fecha_vencimiento: String(cuota.fecha_vencimiento || ''),
      estado: String(cuota.estado || 'PENDIENTE').toUpperCase(),
      pagable: Boolean(cuota.pagable ?? cuota.puede_pagar ?? false),
    }));
    const totalCuotas = response.resumen?.total_cuotas ?? cuotas.length;
    const montoTotal = response.resumen?.monto_total ?? cuotas.reduce((acc, cuota) => acc + cuota.monto, 0);
    const montoPagado = response.resumen?.monto_pagado ?? cuotas.reduce((acc, cuota) => acc + cuota.monto_pagado, 0);
    const saldoPendiente = response.resumen?.saldo_pendiente ?? cuotas.reduce((acc, cuota) => acc + cuota.saldo, 0);

    return {
      contrato_id: String(response.contrato_id ?? contratoId),
      cliente_id: String(response.cliente_id ?? ''),
      servicio: String(response.servicio || `Contrato ${contratoId}`),
      estado_contrato: String(response.estado_contrato || ''),
      resumen: {
        total_cuotas: Number(totalCuotas),
        cuotas_pagadas: Number(response.resumen?.cuotas_pagadas ?? cuotas.filter((cuota) => cuota.estado === 'PAGADA').length),
        cuotas_pendientes: Number(response.resumen?.cuotas_pendientes ?? cuotas.filter((cuota) => cuota.estado !== 'PAGADA').length),
        cuotas_vencidas: Number(response.resumen?.cuotas_vencidas ?? cuotas.filter((cuota) => cuota.estado === 'VENCIDA').length),
        monto_total: Number(montoTotal),
        monto_pagado: Number(montoPagado),
        saldo_pendiente: Number(saldoPendiente),
      },
      cuotas,
    };
  }

  private normalizeValidationResponse(
    payload: PaymentIntentValidateRequest,
    response: any
  ): PaymentIntentValidateResponse {
    if (response?.valid) {
      return {
        valid: true,
        status: response.status || 'APPROVED_TO_PAY',
        external_attempt_id: payload.external_attempt_id,
        cliente_id: payload.cliente_id,
        contrato_id: payload.contrato_id,
        cuota_ids: payload.cuota_ids,
        monto_validado: payload.monto_total,
        expires_at: response.expires_at || new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };
    }

    const errors = Array.isArray(response?.errors) ? response.errors.join(' ') : undefined;
    return {
      valid: false,
      status: 'REJECTED',
      code: response?.code || 'PAYMENT_INTENT_REJECTED',
      message: response?.message || errors || 'Intencion de pago rechazada por SIS.CONTABLE',
      expected_amount: response?.expected_amount,
      received_amount: response?.received_amount,
      invalid_cuotas: response?.invalid_cuotas,
    };
  }

  private async logIntegration(
    direction: 'inbound' | 'outbound',
    eventType: string,
    endpoint: string,
    httpMethod: string,
    request?: any,
    response?: any,
    status?: number,
    durationMs?: number,
    errorMessage?: string
  ) {
    try {
      await prisma.integrationLog.create({
        data: {
          direction,
          system: 'sis_contable',
          event_type: eventType,
          endpoint,
          http_method: httpMethod,
          request_payload_json: request ?? null,
          response_payload_json: response ?? null,
          status: status || null,
          duration_ms: durationMs || null,
          error_message: errorMessage || null,
        },
      });
    } catch (logErr) {
      logger.error('SIS.CONTABLE integration log write failed', { error: logErr as Error });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const sisContableClient = new SisContableClient();
