import { Request, Response } from 'express';
import { billingService } from '../services/billing.service.js';
import { billingProviderRegistry } from '../billing/index.js';
import prisma from '../lib/prisma.js';
import type { BillingDocumentType, BillingProviderName } from '../billing/types.js';

export class BillingController {
  async issuePaymentDocument(req: Request, res: Response) {
    try {
      const document = await billingService.issueForPayment(req.params.id, {
        document_type: req.body?.document_type as BillingDocumentType | undefined,
        provider: req.body?.provider as BillingProviderName | undefined,
      });
      res.status(201).json({ ok: true, document });
    } catch (error: any) {
      res.status(error.status || 500).json({ ok: false, code: error.code || 'BILLING_ISSUE_ERROR', message: error.message });
    }
  }

  async retryDocument(req: Request, res: Response) {
    try {
      const document = await billingService.retryDocument(req.params.id);
      res.json({ ok: true, document });
    } catch (error: any) {
      res.status(error.status || 500).json({ ok: false, code: error.code || 'BILLING_RETRY_ERROR', message: error.message });
    }
  }

  async listDocuments(req: Request, res: Response) {
    try {
      res.json(await billingService.listDocuments(req.query as any));
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error.message });
    }
  }

  async listClientDocuments(req: Request, res: Response) {
    try {
      const clienteId = (req as any).client?.cliente_contable_id;
      if (!clienteId) {
        res.status(401).json({ ok: false, code: 'UNAUTHORIZED', message: 'Sesion cliente requerida' });
        return;
      }
      const documents = await prisma.billingDocument.findMany({
        where: { payment: { cliente_contable_id: clienteId } },
        orderBy: { created_at: 'desc' },
        take: 50,
        include: { payment: true },
      });
      res.json({ ok: true, documents });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error.message });
    }
  }

  async handleWebhook(req: Request, res: Response) {
    try {
      const document = await billingService.handleWebhook(req.params.provider as BillingProviderName, req.headers as Record<string, string>, req.body);
      res.json({ ok: true, document });
    } catch (error: any) {
      res.status(error.status || 500).json({ ok: false, code: error.code || 'BILLING_WEBHOOK_ERROR', message: error.message });
    }
  }

  async getProviders(_req: Request, res: Response) {
    try {
      res.json({
        ok: true,
        environment: billingProviderRegistry.getEnvironment(),
        providers: billingProviderRegistry.getConfigSummary(),
        health: await billingProviderRegistry.healthCheckAll(),
      });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error.message });
    }
  }
}

export const billingController = new BillingController();
