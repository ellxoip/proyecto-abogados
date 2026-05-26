import axios, { AxiosInstance, AxiosError } from 'axios';
import dotenv from 'dotenv';
import type { CrmAuthResponse, CrmLead, CrmPaymentNotification } from '../types/index.js';
import prisma from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

dotenv.config();

const CRM_BASE_URL = process.env.CRM_BASE_URL || 'http://localhost:8000';
const CRM_EMAIL = process.env.CRM_EMAIL || '';
const CRM_PASSWORD = process.env.CRM_PASSWORD || '';

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

export class CrmClient {
  private client: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor() {
    this.client = axios.create({
      baseURL: CRM_BASE_URL,
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
  }

  // ===========================================================
  // Auth — JWT login with auto-refresh
  // ===========================================================
  async login(): Promise<void> {
    const startTime = Date.now();
    try {
      const response = await this.client.post<CrmAuthResponse>('/api/auth/login', {
        email: CRM_EMAIL,
        password: CRM_PASSWORD,
      });

      this.accessToken = response.data.access_token;
      // Assume token valid for 55 min (refresh before 60 min expiry)
      this.tokenExpiresAt = Date.now() + 55 * 60 * 1000;

      await this.logIntegration('outbound', 'crm_login', '/api/auth/login', 'POST',
        { email: CRM_EMAIL }, { success: true }, 200, Date.now() - startTime);
    } catch (error: any) {
      const axiosErr = error as AxiosError;
      await this.logIntegration('outbound', 'crm_login_error', '/api/auth/login', 'POST',
        { email: CRM_EMAIL }, axiosErr.response?.data, axiosErr.response?.status, Date.now() - startTime,
        axiosErr.message);
      throw {
        message: 'Failed to authenticate with CRM',
        status: axiosErr.response?.status || 500,
        details: axiosErr.response?.data || axiosErr.message,
      };
    }
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.accessToken || Date.now() >= this.tokenExpiresAt) {
      await this.login();
    }
  }

  private getAuthHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.accessToken}` };
  }

  // ===========================================================
  // Notificar pago confirmado al CRM
  // ===========================================================
  async notifyPaymentConfirmed(data: CrmPaymentNotification): Promise<void> {
    const startTime = Date.now();
    const endpoint = '/api/payments';

    try {
      const response = await this.requestWithRetry('crm_notify_payment', async () => {
        await this.ensureAuthenticated();
        return this.client.post(endpoint, data, {
          headers: this.getAuthHeaders(),
        });
      });

      await this.logIntegration('outbound', 'crm_notify_payment', endpoint, 'POST',
        data, response.data, response.status, Date.now() - startTime);
    } catch (error: any) {
      const axiosErr = error as AxiosError;

      await this.logIntegration('outbound', 'crm_notify_payment_error', endpoint, 'POST',
        data, axiosErr.response?.data, axiosErr.response?.status, Date.now() - startTime,
        axiosErr.message);
      throw {
        message: 'Failed to notify payment to CRM',
        status: axiosErr.response?.status || 500,
        details: axiosErr.response?.data || axiosErr.message,
      };
    }
  }

  // ===========================================================
  // Consultar lead por RUT/email
  // ===========================================================
  async getLeadByIdentifier(identifier: string): Promise<CrmLead | null> {
    const startTime = Date.now();
    const endpoint = `/api/leads?search=${encodeURIComponent(identifier)}`;

    try {
      const response = await this.requestWithRetry('crm_get_lead', async () => {
        await this.ensureAuthenticated();
        return this.client.get(endpoint, {
          headers: this.getAuthHeaders(),
        });
      });

      const leads = response.data?.data || response.data || [];
      const lead = Array.isArray(leads) && leads.length > 0 ? leads[0] : null;

      await this.logIntegration('outbound', 'crm_get_lead', endpoint, 'GET',
        { identifier }, { found: !!lead }, 200, Date.now() - startTime);

      return lead;
    } catch (error: any) {
      const axiosErr = error as AxiosError;
      await this.logIntegration('outbound', 'crm_get_lead_error', endpoint, 'GET',
        { identifier }, axiosErr.response?.data, axiosErr.response?.status, Date.now() - startTime,
        axiosErr.message);
      // Non-critical: return null instead of throwing
      return null;
    }
  }

  // ===========================================================
  // Enviar mensaje WhatsApp al cliente (confirmación de pago)
  // ===========================================================
  async sendPaymentConfirmationWhatsApp(phone: string, message: string): Promise<void> {
    const startTime = Date.now();
    const endpoint = '/api/whatsapp/send';

    try {
      const payload = { to: phone, message };
      const response = await this.requestWithRetry('crm_whatsapp_send', async () => {
        await this.ensureAuthenticated();
        return this.client.post(endpoint, payload, {
          headers: this.getAuthHeaders(),
        });
      });

      await this.logIntegration('outbound', 'crm_whatsapp_send', endpoint, 'POST',
        payload, response.data, response.status, Date.now() - startTime);
    } catch (error: any) {
      const axiosErr = error as AxiosError;
      await this.logIntegration('outbound', 'crm_whatsapp_error', endpoint, 'POST',
        { phone }, axiosErr.response?.data, axiosErr.response?.status, Date.now() - startTime,
        axiosErr.message);
      // Non-critical: log but don't throw
      logger.warn('CRM WhatsApp notification failed', { error: axiosErr.message });
    }
  }

  private async requestWithRetry<T>(eventType: string, operation: () => Promise<T>): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        const axiosErr = error as AxiosError;
        const status = axiosErr.response?.status;
        const isUnauthorized = status === 401;
        const isRetryable = !status || status === 408 || status === 409 || status === 425 || status === 429 || status >= 500 || isUnauthorized;

        if (isUnauthorized) {
          this.accessToken = null;
          this.tokenExpiresAt = 0;
        }

        if (!isRetryable || attempt === MAX_RETRIES) {
          throw error;
        }

        const delay = this.getRetryDelay(attempt);
        logger.warn('CRM request retry scheduled', {
          eventType,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          status: status || 'network_error',
          delayMs: delay,
        });
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private getRetryDelay(attempt: number) {
    const jitter = Math.floor(Math.random() * 250);
    return RETRY_BASE_DELAY_MS * Math.pow(2, attempt) + jitter;
  }

  // ===========================================================
  // Integration Logging
  // ===========================================================
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
          system: 'crm',
          event_type: eventType,
          endpoint,
          http_method: httpMethod,
          request_payload_json: request ? JSON.stringify(request) : null,
          response_payload_json: response ? JSON.stringify(response) : null,
          status: status || null,
          duration_ms: durationMs || null,
          error_message: errorMessage || null,
        },
      });
    } catch (logErr) {
      logger.error('CRM integration log write failed', { error: logErr as Error });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const crmClient = new CrmClient();
