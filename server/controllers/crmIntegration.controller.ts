import type { Request, Response } from 'express';
import { z } from 'zod';
import { sisContableClient } from '../clients/sisContable.client.js';
import { createClientToken } from '../lib/clientAuth.js';
import { logger } from '../lib/logger.js';
import {
  upsertClientFromCrm,
  findProfileByMagicToken,
  markMagicTokenUsed,
  buildAutoLoginUrl,
  hasPasswordChanged,
} from '../services/crmIntegration.service.js';

const fromCrmSchema = z.object({
  rut: z.string().min(3),
  nombre: z.string().min(1),
  telefono: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  rut_empresa: z.string().optional().nullable(),
  empresa: z.string().optional().nullable(),
  ciudad: z.string().optional().nullable(),
  area: z.string().optional().nullable(),
  prioridad: z.string().optional().nullable(),
  vendedor: z.string().optional().nullable(),
  agendadora: z.string().optional().nullable(),
  fuente: z.string().optional().nullable(),
  total: z.number().optional().nullable(),
  cuota_inicial: z.number().optional().nullable(),
  num_cuotas: z.number().int().optional().nullable(),
  monto_cuota: z.number().optional().nullable(),
  descripcion: z.string().optional().nullable(),
  notas_internas: z.string().optional().nullable(),
  crm_lead_id: z.union([z.string(), z.number()]).optional().nullable(),
});

export class CrmIntegrationController {
  async createOrUpdateFromCrm(req: Request, res: Response) {
    const parsed = fromCrmSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        code: 'INVALID_PAYLOAD',
        message: 'Payload inválido.',
        details: parsed.error.flatten(),
      });
      return;
    }

    const data = parsed.data;
    try {
      const { profile, isNew, autoLoginUrl } = await upsertClientFromCrm({
        ...data,
        crm_lead_id: data.crm_lead_id !== null && data.crm_lead_id !== undefined ? String(data.crm_lead_id) : null,
      });

      logger.info('CRM client profile upserted', {
        identifier: profile.identifier,
        isNew,
      });

      res.status(isNew ? 201 : 200).json({
        ok: true,
        isNew,
        profile: {
          id: profile.id,
          identifier: profile.identifier,
          nombre: profile.nombre,
          email: profile.email,
        },
        autoLoginUrl,
        magicToken: profile.magic_token,
      });
    } catch (error: any) {
      logger.error('Failed to upsert CRM client profile', { error: error?.message });
      res.status(500).json({
        ok: false,
        code: 'CRM_PROFILE_UPSERT_FAILED',
        message: error?.message || 'Error al registrar el cliente desde el CRM.',
      });
    }
  }

  /**
   * Auto-login by magic token.
   * - Validates magic_token (permanent unless revoked).
   * - Calls SIS.CONTABLE to fetch the cliente_contable_id + deudas.
   * - Issues a 4h JWT session for the client.
   */
  async autoLogin(req: Request, res: Response) {
    const token = String(req.query.token ?? req.body?.token ?? '').trim();
    if (!token) {
      res.status(400).json({ ok: false, code: 'TOKEN_REQUIRED', message: 'Falta el token.' });
      return;
    }

    const profile = await findProfileByMagicToken(token);
    if (!profile) {
      res.status(401).json({
        ok: false,
        code: 'INVALID_TOKEN',
        message: 'Token inválido o revocado.',
      });
      return;
    }

    try {
      const debts = await sisContableClient.getDebtsByIdentifier(profile.identifier);
      if (!debts?.cliente?.id) {
        res.status(404).json({
          ok: false,
          code: 'CLIENT_NOT_IN_SIS',
          message: 'El cliente todavía no tiene cuotas en SIS.CONTABLE. Reintenta más tarde.',
        });
        return;
      }

      const email = debts.cliente.email || profile.email || '';
      const passwordChanged = await hasPasswordChanged(profile.identifier);
      const mustChangePassword = !passwordChanged;
      const sessionToken = createClientToken({
        identifier: profile.identifier,
        cliente_contable_id: debts.cliente.id,
        email,
        auth_method: 'magic_link',
        password_change_grant: mustChangePassword,
      });

      await markMagicTokenUsed(profile.id, debts.cliente.id);

      res.json({
        ok: true,
        token: sessionToken,
        cliente: {
          id: debts.cliente.id,
          rut: debts.cliente.rut,
          nombre: debts.cliente.nombre,
          email,
        },
        mustChangePassword,
        debts,
        profile: {
          identifier: profile.identifier,
          nombre: profile.nombre,
          passwordChanged,
        },
      });
    } catch (error: any) {
      logger.error('Auto-login failed', { error: error?.message, token: '<redacted>' });
      const status = error?.status || 500;
      res.status(status).json({
        ok: false,
        code: error?.code || 'AUTO_LOGIN_FAILED',
        message: error?.message || 'No fue posible iniciar sesión automáticamente.',
      });
    }
  }

  async getLinkByIdentifier(req: Request, res: Response) {
    const identifier = String(req.params.identifier || '').trim();
    if (!identifier) {
      res.status(400).json({ ok: false, code: 'IDENTIFIER_REQUIRED', message: 'Falta el identificador.' });
      return;
    }

    try {
      // Reuse normalizeIdentifier via service: look up by raw RUT after upsert/find
      const { default: prisma } = await import('../lib/prisma.js');
      const { normalizeIdentifier } = await import('../lib/clientAuth.js');
      const profile = await prisma.$queryRaw<Array<{ magic_token: string; magic_token_revoked: boolean }>>`
        SELECT "magic_token", "magic_token_revoked"
        FROM "CrmClientProfile"
        WHERE "identifier" = ${normalizeIdentifier(identifier)}
        LIMIT 1
      `.then((rows) => rows[0] ?? null);
      if (!profile) {
        res.status(404).json({ ok: false, code: 'PROFILE_NOT_FOUND', message: 'No existe perfil para ese identificador.' });
        return;
      }

      res.json({
        ok: true,
        autoLoginUrl: buildAutoLoginUrl(profile.magic_token),
        revoked: profile.magic_token_revoked,
      });
    } catch (error: any) {
      res.status(500).json({ ok: false, code: 'LOOKUP_FAILED', message: error?.message });
    }
  }
}

export const crmIntegrationController = new CrmIntegrationController();
