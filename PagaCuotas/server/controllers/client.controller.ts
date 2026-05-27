import type { Request, Response } from 'express';
import { sisContableClient } from '../clients/sisContable.client.js';
import { hiveCrmClient } from '../clients/hiveCrm.client.js';
import { createClientToken, normalizeIdentifier } from '../lib/clientAuth.js';
import { hasPasswordChanged, markPasswordChanged } from '../services/crmIntegration.service.js';

export class ClientController {
  async login(req: Request, res: Response) {
    const { identifier, password } = req.body as { identifier: string; password: string };

    try {
      const { cliente, debts } = await sisContableClient.loginClient(identifier, password);

      const token = createClientToken({
        identifier: cliente.rut || identifier,
        cliente_contable_id: cliente.id,
        email: cliente.email || '',
      });

      res.json({
        ok: true,
        token,
        cliente: {
          id: cliente.id,
          rut: cliente.rut,
          nombre: cliente.nombre,
          email: cliente.email,
        },
        debts,
      });
    } catch (error: any) {
      if (error.status === 401 || error.code === 'CLIENT_NOT_FOUND' || error.details?.code === 'CLIENT_NOT_FOUND') {
        res.status(401).json({ ok: false, code: 'CLIENT_INVALID_CREDENTIALS', message: 'Credenciales invalidas.' });
        return;
      }
      res.status(error.status || 500).json({ ok: false, code: error.code || 'CLIENT_LOGIN_ERROR', message: error.message });
    }
  }

  async updatePassword(req: Request, res: Response) {
    const { identifier, currentPassword, newPassword } = req.body as {
      identifier: string;
      currentPassword?: string;
      newPassword: string;
    };

    try {
      if (!req.client || normalizeIdentifier(req.client.sub) !== normalizeIdentifier(identifier)) {
        res.status(403).json({ ok: false, code: 'FORBIDDEN', message: 'Acceso denegado a este identificador.' });
        return;
      }

      const canUseAutoLoginGrant =
        req.client.auth_method === 'magic_link' &&
        req.client.password_change_grant === true &&
        !(await hasPasswordChanged(identifier));

      if (canUseAutoLoginGrant) {
        await sisContableClient.setClientPasswordFromAutoLogin(identifier, newPassword);
        await markPasswordChanged(identifier);
        const token = createClientToken({
          identifier,
          cliente_contable_id: req.client.cliente_contable_id,
          email: req.client.email || '',
        });
        res.json({ ok: true, token });
        return;
      }

      if (!currentPassword) {
        res.status(400).json({ ok: false, code: 'CURRENT_PASSWORD_REQUIRED', message: 'Debes ingresar la clave actual.' });
        return;
      }

      await sisContableClient.updateClientPassword(identifier, currentPassword, newPassword);
      res.json({ ok: true });
    } catch (error: any) {
      if (error.status === 401) {
        res.status(401).json({ ok: false, code: 'CLIENT_INVALID_CREDENTIALS', message: 'Credenciales invalidas.' });
        return;
      }
      res.status(error.status || 500).json({ ok: false, code: error.code || 'CLIENT_PASSWORD_UPDATE_ERROR', message: error.message });
    }
  }

  async getCaseUpdates(req: Request, res: Response) {
    try {
      const identifier = req.client?.sub;
      if (!identifier) {
        res.status(401).json({ ok: false, code: 'UNAUTHORIZED', message: 'Sesión no válida.' });
        return;
      }

      const data = await hiveCrmClient.getCaseUpdates(identifier);

      res.json({
        ok: true,
        cases: data.cases || [],
      });
    } catch (error: any) {
      // If hive-service-control is unreachable, return empty gracefully
      if (error.status === 404 || error.code === 'SIS_CONTABLE_ERROR') {
        res.json({ ok: true, cases: [] });
        return;
      }
      res.status(error.status || 500).json({
        ok: false,
        code: error.code || 'CASE_UPDATES_ERROR',
        message: error.message || 'No fue posible obtener los avances del caso.',
      });
    }
  }
}

export const clientController = new ClientController();
