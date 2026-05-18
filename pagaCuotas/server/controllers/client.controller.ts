import type { Request, Response } from 'express';
import { sisContableClient } from '../clients/sisContable.client.js';
import { createClientToken } from '../lib/clientAuth.js';

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
      currentPassword: string;
      newPassword: string;
    };

    try {
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
}

export const clientController = new ClientController();
