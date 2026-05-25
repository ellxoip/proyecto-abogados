import { Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { paymentService } from '../services/payment.service.js';
import { paymentNotificationService } from '../services/notification.service.js';
import { providerRegistry } from '../providers/index.js';
import { billingService } from '../services/billing.service.js';
import { createAdminToken, validateAdminCredentials } from '../lib/adminAuth.js';
import { reconciliationService } from '../services/reconciliation.service.js';
import { logger } from '../lib/logger.js';
import { getMorosidadOverview } from '../services/financial-warnings.service.js';

export class PaymentController {
  async adminLogin(req: Request, res: Response) {
    const { email, password } = req.body || {};
    if (!validateAdminCredentials(String(email || ''), String(password || ''))) {
      res.status(401).json({ ok: false, message: 'Credenciales invalidas' });
      return;
    }

    res.json({ ok: true, token: createAdminToken(email), email });
  }

  async getAdminSummary(_req: Request, res: Response) {
    try {
      const [payments, attempts, failedSis, failedCrm, logs] = await Promise.all([
        prisma.payment.findMany({ where: { status: 'confirmado' }, orderBy: { paid_at: 'desc' }, take: 500 }),
        prisma.paymentAttempt.findMany({ orderBy: { created_at: 'desc' }, take: 500 }),
        prisma.payment.count({ where: { sis_contable_sync_status: 'failed' } }),
        prisma.payment.count({ where: { crm_sync_status: 'failed' } }),
        prisma.integrationLog.findMany({ orderBy: { created_at: 'desc' }, take: 10 }),
      ]);

      const confirmedTotal = payments.reduce((acc, payment) => acc + Number(payment.amount), 0);
      const pendingAttempts = attempts.filter((attempt) => attempt.status === 'iniciado').length;
      const rejectedAttempts = attempts.filter((attempt) => attempt.status === 'rechazado').length;

      res.json({
        ok: true,
        metrics: {
          confirmed_total: confirmedTotal,
          confirmed_count: payments.length,
          attempts_count: attempts.length,
          pending_attempts: pendingAttempts,
          rejected_attempts: rejectedAttempts,
          sis_contable_failed: failedSis,
          crm_failed: failedCrm,
        },
        recent_logs: logs,
      });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error.message });
    }
  }

  async getAdminMorosidadWarnings(_req: Request, res: Response) {
    try {
      const overview = await getMorosidadOverview();
      res.json({ ok: true, ...overview });
    } catch (error: any) {
      res.status(502).json({ ok: false, message: error?.message || 'No se pudo consultar financial' });
    }
  }

  async getAdminProfile(req: Request, res: Response) {
    const admin = (req as any).admin || {};
    res.json({
      ok: true,
      profile: {
        email: admin.sub || process.env.ADMIN_EMAIL || 'admin@pagacuotas.local',
        role: 'Super Admin',
        permissions: ['payments:read', 'payments:resync', 'clients:read', 'support:manage', 'settings:read'],
        session_expires_at: admin.exp ? new Date(admin.exp).toISOString() : null,
        environment: process.env.PAYMENT_ENVIRONMENT || 'sandbox',
      },
    });
  }

  async getAdminNotifications(_req: Request, res: Response) {
    try {
      const [failedPayments, failedAttempts, openTickets, failedLogs] = await Promise.all([
        prisma.payment.findMany({
          where: {
            OR: [
              { sis_contable_sync_status: 'failed' },
              { crm_sync_status: 'failed' },
            ],
          },
          orderBy: { updated_at: 'desc' },
          take: 5,
        }),
        prisma.paymentAttempt.findMany({
          where: {
            OR: [
              { status: { in: ['rechazado', 'error'] } },
              { sis_contable_sync_status: 'failed' },
            ],
          },
          orderBy: { updated_at: 'desc' },
          take: 5,
        }),
        prisma.supportTicket.findMany({
          where: { status: { in: ['open', 'in_progress'] } },
          orderBy: { created_at: 'desc' },
          take: 5,
        }),
        prisma.integrationLog.findMany({
          where: {
            OR: [
              { error_message: { not: null } },
              { status: { gte: 400 } },
            ],
          },
          orderBy: { created_at: 'desc' },
          take: 5,
        }),
      ]);

      const notifications = [
        ...failedPayments.map((payment) => ({
          id: `payment:${payment.id}`,
          type: 'sync_failed',
          severity: 'high',
          title: 'Sincronizacion de pago fallida',
          message: `${payment.external_payment_id} requiere revision SIS/CRM.`,
          created_at: payment.updated_at,
          href: '/admin/dashboard',
        })),
        ...failedAttempts.map((attempt) => ({
          id: `attempt:${attempt.id}`,
          type: 'payment_attempt',
          severity: attempt.status === 'error' ? 'high' : 'medium',
          title: 'Intento de pago con incidencia',
          message: `${attempt.external_attempt_id} esta en estado ${attempt.status}.`,
          created_at: attempt.updated_at,
          href: '/admin/dashboard',
        })),
        ...openTickets.map((ticket) => ({
          id: `support:${ticket.id}`,
          type: 'support_ticket',
          severity: ticket.priority === 'urgent' || ticket.priority === 'high' ? 'high' : 'medium',
          title: `Soporte ${ticket.ticket_number}`,
          message: ticket.subject,
          created_at: ticket.created_at,
          href: '/admin/support',
        })),
        ...failedLogs.map((log) => ({
          id: `log:${log.id}`,
          type: 'integration_log',
          severity: 'medium',
          title: `Evento ${log.system} con error`,
          message: log.error_message || `${log.event_type} respondio ${log.status}`,
          created_at: log.created_at,
          href: '/admin/integrations',
        })),
      ]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 12);

      res.json({
        ok: true,
        unread_count: notifications.length,
        notifications,
      });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error.message });
    }
  }

  async getAdminClients(_req: Request, res: Response) {
    try {
      const attempts = await prisma.paymentAttempt.findMany({
        orderBy: { created_at: 'desc' },
        take: 200,
        include: { payments: true },
      });

      const byClient = new Map<string, any>();
      for (const attempt of attempts) {
        const key = attempt.cliente_contable_id;
        const current = byClient.get(key) || {
          cliente_contable_id: key,
          identifier: attempt.cliente_identifier || key,
          contracts: new Set<string>(),
          attempts: 0,
          confirmed_payments: 0,
          total_paid: 0,
          last_activity: attempt.created_at,
          sync_errors: 0,
        };
        current.contracts.add(attempt.contrato_contable_id);
        current.attempts += 1;
        current.confirmed_payments += attempt.payments.filter((payment) => payment.status === 'confirmado').length;
        current.total_paid += attempt.payments.reduce((acc, payment) => acc + Number(payment.amount), 0);
        current.sync_errors += attempt.payments.filter((payment) => payment.sis_contable_sync_status === 'failed' || payment.crm_sync_status === 'failed').length;
        if (attempt.created_at > current.last_activity) current.last_activity = attempt.created_at;
        byClient.set(key, current);
      }

      const clients = Array.from(byClient.values()).map((client) => ({
        ...client,
        contracts: Array.from(client.contracts),
        status: client.sync_errors > 0 ? 'REQUIERE_REVISION' : client.confirmed_payments > 0 ? 'CON_PAGOS' : 'SIN_PAGOS_CONFIRMADOS',
      }));

      res.json({ ok: true, clients });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error.message });
    }
  }

  // ===========================================================
  // Client: GET /api/deudas/:identifier
  // ===========================================================
  async getDebts(req: Request, res: Response) {
    try {
      const { identifier } = req.params;
      const debts = await paymentService.getDebts(identifier);
      res.json(debts);
    } catch (error: any) {
      res.status(error.status || 500).json({
        ok: false, code: error.code || 'INTERNAL_ERROR', message: error.message,
      });
    }
  }

  // ===========================================================
  // Client: GET /api/contratos/:contratoId/cuotas
  // ===========================================================
  async getContractInstallments(req: Request, res: Response) {
    try {
      const { contratoId } = req.params;
      const installments = await paymentService.getContractInstallments(contratoId);
      res.json(installments);
    } catch (error: any) {
      res.status(error.status || 500).json({
        ok: false, code: error.code || 'INTERNAL_ERROR', message: error.message,
      });
    }
  }

  // ===========================================================
  // Client: POST /api/payment-intents
  // ===========================================================
  async createPaymentIntent(req: Request, res: Response) {
    try {
      const intent = await paymentService.createPaymentIntent(req.body);
      res.status(201).json({ ok: true, ...intent });
    } catch (error: any) {
      res.status(error.status || 400).json({
        ok: false, code: error.code || 'PAYMENT_INTENT_ERROR', message: error.message, details: error.details || null,
      });
    }
  }

  // ===========================================================
  // Integration: POST /api/integration/payment-intents
  // ===========================================================
  async createIntegrationPaymentIntent(req: Request, res: Response) {
    try {
      const provider = process.env.PAYMENT_PROVIDER || 'simulator';
      const intent = await paymentService.createPaymentIntent({ ...req.body, provider });
      res.status(201).json({ ok: true, ...intent });
    } catch (error: any) {
      res.status(error.status || 400).json({
        ok: false, code: error.code || 'PAYMENT_INTENT_ERROR', message: error.message, details: error.details || null,
      });
    }
  }

  // ===========================================================
  // Client: GET /api/payments/callback — Provider redirect
  // ===========================================================
  async handleProviderCallback(req: Request, res: Response) {
    try {
      // MercadoPago uses payment_id/preference_id
      const token = (req.query.payment_id || req.query.preference_id || req.query.token || req.query.token_ws) as string;
      const providerName = req.query.provider as string | undefined;
      const source = String(req.query.source || '');
      const simulated = String(req.query.simulated || '') === 'true';

      if (!token) {
        res.status(400).json({ ok: false, code: 'MISSING_TOKEN', message: 'No payment token received' });
        return;
      }

      const result = await paymentService.processProviderCallback(token, providerName);
      // Redirect to client portal with result
      const status = (result as any)?.status === 'confirmado' ? 'success' : 'failed';
      const query = new URLSearchParams({
        result: status,
        payment_id: (result as any)?.external_payment_id || '',
      });
      if (providerName) query.set('provider', providerName);
      if (source) query.set('source', source);
      if (simulated) query.set('simulated', 'true');
      const portalBase = (process.env.CLIENT_PORTAL_BASE_URL || 'http://localhost:3002').replace(/\/+$/, '');
      res.redirect(`${portalBase}/client/payment?${query.toString()}`);
    } catch (error: any) {
      const portalBase = (process.env.CLIENT_PORTAL_BASE_URL || 'http://localhost:3002').replace(/\/+$/, '');
      res.redirect(`${portalBase}/client/payment?result=error&message=${encodeURIComponent(error.message)}`);
    }
  }

  // ===========================================================
  // Webhook: POST /api/webhooks/payment-provider
  // ===========================================================
  async handleWebhook(req: Request, res: Response) {
    try {
      const result = await paymentService.processWebhook(req.body);
      res.json({ ok: true, result });
    } catch (error: any) {
      logger.error('Payment webhook error', { error: error as Error });
      res.status(error.status || 500).json({ ok: false, code: error.code || 'WEBHOOK_ERROR', message: error.message });
    }
  }

  async handleProviderWebhook(req: Request, res: Response) {
    try {
      const { provider } = req.params;
      const result = await paymentService.processProviderWebhook(
        provider,
        req.headers as Record<string, string>,
        req.body,
        req.query
      );
      res.json({ ok: true, result });
    } catch (error: any) {
      logger.error('Payment provider webhook error', { error: error as Error });
      res.status(error.status || 500).json({ ok: false, code: error.code || 'WEBHOOK_ERROR', message: error.message });
    }
  }

  // ===========================================================
  // Webhook: POST /api/webhooks/payment-reversal
  // ===========================================================
  async handleReversal(req: Request, res: Response) {
    try {
      const result = await paymentService.processReversal(req.body);
      res.json({ ok: true, result });
    } catch (error: any) {
      res.status(error.status || 500).json({ ok: false, code: error.code || 'REVERSAL_ERROR', message: error.message });
    }
  }

  // ===========================================================
  // Admin: GET /api/admin/payment-attempts
  // ===========================================================
  async getPaymentAttempts(req: Request, res: Response) {
    try {
      const { page, limit, status, provider } = req.query as unknown as { page: number; limit: number; status?: string; provider?: string };
      const skip = (page - 1) * limit;

      const where: any = {};
      if (status) where.status = status;
      if (provider) where.provider = provider;

      const [data, total] = await Promise.all([
        prisma.paymentAttempt.findMany({ where, orderBy: { created_at: 'desc' }, skip, take: limit }),
        prisma.paymentAttempt.count({ where }),
      ]);

      res.json({ ok: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error.message });
    }
  }

  // ===========================================================
  // Admin: GET /api/admin/payments
  // ===========================================================
  async getPayments(req: Request, res: Response) {
    try {
      const { page, limit, status } = req.query as unknown as { page: number; limit: number; status?: string };
      const skip = (page - 1) * limit;

      const where = status ? { status } : {};

      const [data, total] = await Promise.all([
        prisma.payment.findMany({ where, orderBy: { created_at: 'desc' }, skip, take: limit, include: { attempt: true } }),
        prisma.payment.count({ where }),
      ]);

      res.json({ ok: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error.message });
    }
  }

  // ===========================================================
  // Admin: GET /api/admin/integration-logs
  // ===========================================================
  async getIntegrationLogs(req: Request, res: Response) {
    try {
      const { page, limit, system, direction } = req.query as unknown as { page: number; limit: number; system?: string; direction?: string };
      const skip = (page - 1) * limit;

      const where: any = {};
      if (system) where.system = system;
      if (direction) where.direction = direction;

      const [data, total] = await Promise.all([
        prisma.integrationLog.findMany({ where, orderBy: { created_at: 'desc' }, skip, take: limit }),
        prisma.integrationLog.count({ where }),
      ]);

      res.json({ ok: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error.message });
    }
  }

  // ===========================================================
  // Admin: POST /api/admin/payments/:id/resync
  // ===========================================================
  async resyncPayment(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const payment = await prisma.payment.findUnique({ where: { id }, include: { attempt: true } });
      if (!payment) { res.status(404).json({ ok: false, message: 'Payment not found' }); return; }

      await paymentService.syncPaymentWithSisContable(payment, payment.attempt);
      res.json({ ok: true, message: 'SIS.CONTABLE sync retried' });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error.message });
    }
  }

  // ===========================================================
  // Admin: POST /api/admin/payments/:id/resync-crm
  // ===========================================================
  async resyncPaymentCrm(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const payment = await prisma.payment.findUnique({ where: { id }, include: { attempt: true } });
      if (!payment) { res.status(404).json({ ok: false, message: 'Payment not found' }); return; }

      await paymentService.syncPaymentWithCrm(payment, payment.attempt);
      res.json({ ok: true, message: 'CRM sync retried' });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error.message });
    }
  }

  // ===========================================================
  // Admin: POST /api/admin/retry-all-failed
  // ===========================================================
  async retryAllFailed(_req: Request, res: Response) {
    try {
      const result = await paymentNotificationService.retryAllFailed();
      res.json({ ok: true, result });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error.message });
    }
  }

  async runReconciliation(_req: Request, res: Response) {
    try {
      const result = await reconciliationService.runManualReconciliation();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error.message });
    }
  }

  // ===========================================================
  // Admin: GET /api/admin/providers
  // ===========================================================
  async getProviders(_req: Request, res: Response) {
    try {
      const config = providerRegistry.getConfigSummary();
      const health = await providerRegistry.healthCheckAll();
      res.json({ ok: true, environment: providerRegistry.getEnvironment(), providers: config, health });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error.message });
    }
  }

  // ===========================================================
  // Health: GET /api/health
  // ===========================================================
  async healthCheck(_req: Request, res: Response) {
    let databaseStatus = 'connected';
    let databaseError: string | null = null;
    let failedSis = 0;
    let failedCrm = 0;

    try {
      await prisma.$queryRaw`SELECT 1`;
      const syncCounts = await Promise.all([
        prisma.payment.count({ where: { sis_contable_sync_status: 'failed' } }),
        prisma.payment.count({ where: { crm_sync_status: 'failed' } }),
      ]);
      failedSis = syncCounts[0];
      failedCrm = syncCounts[1];
    } catch (error: any) {
      databaseStatus = 'degraded';
      databaseError = error.message;
    }

    const providerHealth = await providerRegistry.healthCheckAll();
    const billingHealth = await billingService.health();
    const status = databaseStatus === 'connected' ? 'healthy' : 'degraded';

    res.status(status === 'healthy' ? 200 : 503).json({
      ok: status === 'healthy',
      status,
      version: '1.0.0',
      environment: providerRegistry.getEnvironment(),
      timestamp: new Date().toISOString(),
      database: databaseStatus,
      database_error: databaseError,
      providers: providerHealth,
      billing: billingHealth,
      sync_status: {
        sis_contable_failed: failedSis,
        crm_failed: failedCrm,
      },
    });
  }
}

export const paymentController = new PaymentController();
