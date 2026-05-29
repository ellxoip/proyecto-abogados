import axios, { AxiosInstance, AxiosError } from 'axios';
import dotenv from 'dotenv';
import type { CaseUpdatesResponse } from '../types/index.js';
import prisma from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

dotenv.config();

const HIVE_CRM_BASE_URL = process.env.HIVE_CRM_BASE_URL || process.env.SIS_CONTABLE_BASE_URL || 'http://localhost:3000';
const HIVE_CRM_API_KEY = process.env.HIVE_CRM_API_KEY || process.env.EXTERNAL_API_KEY || '';

/**
 * Client for hive-service-control (AT_INFORMA / Legal CRM).
 *
 * This is separate from SisContableClient because hive-service-control and
 * hive-financial-control are different servers. SisContableClient talks to
 * hive-financial-control for payment/debt data; this client talks to
 * hive-service-control for legal case data (updates, stages, lawyers).
 */
export class HiveCrmClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: HIVE_CRM_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${HIVE_CRM_API_KEY}`,
      },
      timeout: 15000,
    });
  }

  /**
   * Fetch case updates (legal progress timeline) for a client by RUT.
   * Calls GET /api/v1/case-updates/:identifier on hive-service-control.
   */
  async getCaseUpdates(identifier: string): Promise<CaseUpdatesResponse> {
    const endpoint = `/api/v1/case-updates/${encodeURIComponent(identifier)}`;
    const startTime = Date.now();

    try {
      await this.logIntegration('outbound', 'get_case_updates', endpoint, 'GET');

      const response = await this.client.get<CaseUpdatesResponse>(endpoint);
      const duration = Date.now() - startTime;

      await this.logIntegration(
        'inbound', 'get_case_updates_response', endpoint, 'GET',
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
        'inbound', 'get_case_updates_error', endpoint, 'GET',
        null, axiosErr.response?.data, axiosErr.response?.status, duration, errMessage
      );

      // Return empty result on errors to allow graceful degradation
      logger.warn('HiveCRM getCaseUpdates failed', {
        identifier,
        status: axiosErr.response?.status,
        message: errMessage,
      });

      return { success: false, identifier, cliente: null, cases: [] };
    }
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
          system: 'hive_crm',
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
      logger.error('HiveCRM integration log write failed', { error: logErr as Error });
    }
  }
}

export const hiveCrmClient = new HiveCrmClient();
