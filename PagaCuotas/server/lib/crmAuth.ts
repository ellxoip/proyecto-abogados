import type { Request, Response, NextFunction } from 'express';

const CRM_INTEGRATION_API_KEY = process.env.CRM_INTEGRATION_API_KEY || '';

export function requireCrmAuth(req: Request, res: Response, next: NextFunction) {
  const key = (req.headers['x-crm-api-key'] as string | undefined) || '';
  if (!CRM_INTEGRATION_API_KEY || key !== CRM_INTEGRATION_API_KEY) {
    res.status(401).json({
      ok: false,
      code: 'CRM_UNAUTHORIZED',
      message: 'Credenciales de integración CRM inválidas.',
    });
    return;
  }
  next();
}
