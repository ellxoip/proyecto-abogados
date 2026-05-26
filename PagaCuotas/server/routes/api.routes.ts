import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { paymentController } from '../controllers/payment.controller.js';
import { supportController } from '../controllers/support.controller.js';
import { billingController } from '../controllers/billing.controller.js';
import { clientController } from '../controllers/client.controller.js';
import { crmIntegrationController } from '../controllers/crmIntegration.controller.js';
import { requireAdminAuth } from '../lib/adminAuth.js';
import { requireIntegrationAuth } from '../lib/integrationAuth.js';
import { requireCrmAuth } from '../lib/crmAuth.js';
import { requireClientAuth, normalizeIdentifier } from '../lib/clientAuth.js';
import { validate } from '../middleware/validation.middleware.js';
import {
  createPaymentIntentSchema,
  createIntegrationPaymentIntentSchema,
  reversalWebhookSchema,
  paymentAttemptsQuerySchema,
  paymentsQuerySchema,
  integrationLogsQuerySchema,
} from '../validators/payment.validators.js';
import {
  createSupportTicketSchema,
  updateSupportTicketSchema,
} from '../validators/support.validators.js';
import { clientLoginSchema, clientPasswordUpdateSchema } from '../validators/client.validators.js';
import type { Request, Response, NextFunction } from 'express';
import { outboxService } from '../services/outbox.service.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { ok: false, code: 'RATE_LIMITED', message: 'Demasiados intentos. Intenta nuevamente en 15 minutos.' },
});

// Ensures the authenticated client owns the resource being requested.
function ensureClientOwnsIdentifier(req: Request, res: Response, next: NextFunction) {
  const identifier = String(req.params.identifier || '');
  if (!req.client || normalizeIdentifier(req.client.sub) !== normalizeIdentifier(identifier)) {
    res.status(403).json({ ok: false, code: 'FORBIDDEN', message: 'Acceso denegado a este identificador.' });
    return;
  }
  next();
}

function ensureClientOwnsPaymentIntent(req: Request, res: Response, next: NextFunction) {
  const cliente = req.body?.cliente_contable_id;
  if (!req.client || req.client.cliente_contable_id !== cliente) {
    res.status(403).json({ ok: false, code: 'FORBIDDEN', message: 'No puedes crear pagos para otro cliente.' });
    return;
  }
  next();
}

// ===========================================================
// Client Endpoints
// ===========================================================
router.post('/client/login', loginLimiter, validate(clientLoginSchema), clientController.login);
router.patch('/client/password', requireClientAuth, validate(clientPasswordUpdateSchema), clientController.updatePassword);
router.get('/deudas/:identifier', requireClientAuth, ensureClientOwnsIdentifier, paymentController.getDebts);
router.get('/contratos/:contratoId/cuotas', requireClientAuth, paymentController.getContractInstallments);
router.post('/payment-intents', requireClientAuth, validate(createPaymentIntentSchema), ensureClientOwnsPaymentIntent, paymentController.createPaymentIntent);
router.get('/client/billing-documents', requireClientAuth, billingController.listClientDocuments);
router.get('/client/case-updates', requireClientAuth, clientController.getCaseUpdates);
router.post('/support/tickets', validate(createSupportTicketSchema), supportController.createTicket);

// ===========================================================
// Integration Endpoints (server-to-server, SIS.CONTABLE → pagaCuotas)
// ===========================================================
router.post('/integration/payment-intents', requireIntegrationAuth, validate(createIntegrationPaymentIntentSchema), paymentController.createIntegrationPaymentIntent);

// ===========================================================
// CRM Integration (CRM_AT → pagaCuotas)
// CRM pushes lead data when pago_comprometido fires; pagaCuotas returns autoLoginUrl.
// Client opens the URL from WhatsApp → auto-login mints a 4h session JWT.
// ===========================================================
router.post('/integration/clients/from-crm', requireCrmAuth, crmIntegrationController.createOrUpdateFromCrm);
router.get('/integration/clients/:identifier/link', requireCrmAuth, crmIntegrationController.getLinkByIdentifier);
router.get('/auto-login', crmIntegrationController.autoLogin);
router.post('/auto-login', crmIntegrationController.autoLogin);

// ===========================================================
// Provider Callback (redirect after payment page)
// ===========================================================
router.get('/payments/callback', paymentController.handleProviderCallback);

// ===========================================================
// Provider Webhooks (server-to-server)
// ===========================================================
router.post('/webhooks/payment-provider', paymentController.handleWebhook);
router.post('/webhooks/payment-provider/:provider', paymentController.handleProviderWebhook);
router.post('/webhooks/payment-reversal', validate(reversalWebhookSchema), paymentController.handleReversal);
router.post('/webhooks/billing-provider/:provider', billingController.handleWebhook);

// ===========================================================
// Admin Endpoints
// ===========================================================
router.post('/admin/login', loginLimiter, paymentController.adminLogin);
router.get('/admin/profile', requireAdminAuth, paymentController.getAdminProfile);
router.get('/admin/notifications', requireAdminAuth, paymentController.getAdminNotifications);
router.get('/admin/summary', requireAdminAuth, paymentController.getAdminSummary);
router.get('/admin/morosidad-warnings', requireAdminAuth, paymentController.getAdminMorosidadWarnings);
router.get('/admin/clients', requireAdminAuth, paymentController.getAdminClients);
router.get('/admin/payment-attempts', requireAdminAuth, validate(paymentAttemptsQuerySchema, 'query'), paymentController.getPaymentAttempts);
router.get('/admin/payments', requireAdminAuth, validate(paymentsQuerySchema, 'query'), paymentController.getPayments);
router.get('/admin/integration-logs', requireAdminAuth, validate(integrationLogsQuerySchema, 'query'), paymentController.getIntegrationLogs);
router.get('/admin/providers', requireAdminAuth, paymentController.getProviders);
router.get('/admin/billing-providers', requireAdminAuth, billingController.getProviders);
router.get('/admin/billing-documents', requireAdminAuth, billingController.listDocuments);
router.post('/admin/payments/:id/resync', requireAdminAuth, paymentController.resyncPayment);
router.post('/admin/payments/:id/resync-crm', requireAdminAuth, paymentController.resyncPaymentCrm);
router.post('/admin/payments/:id/bill', requireAdminAuth, billingController.issuePaymentDocument);
router.post('/admin/billing-documents/:id/retry', requireAdminAuth, billingController.retryDocument);
router.post('/admin/retry-all-failed', requireAdminAuth, paymentController.retryAllFailed);
router.post('/admin/reconciliation/run', requireAdminAuth, paymentController.runReconciliation);
router.get('/admin/support/tickets', requireAdminAuth, supportController.listTickets);
router.patch('/admin/support/tickets/:id', requireAdminAuth, validate(updateSupportTicketSchema), supportController.updateTicket);

// ===========================================================
// Cron (Vercel Cron Jobs — triggered every 5 min)
// ===========================================================
router.get('/cron/process-outbox', async (req: Request, res: Response) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ ok: false });
    return;
  }
  try {
    const result = await outboxService.processOnce();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===========================================================
// Health & Status
// ===========================================================
router.get('/health', paymentController.healthCheck);

export default router;
