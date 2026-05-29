import type { Request, Response, NextFunction } from 'express';

const SIS_CONTABLE_API_KEY = process.env.SIS_CONTABLE_API_KEY || '';

export function requireIntegrationAuth(req: Request, res: Response, next: NextFunction) {
  const key = req.headers['x-api-key'] as string | undefined;
  if (!SIS_CONTABLE_API_KEY || key !== SIS_CONTABLE_API_KEY) {
    res.status(401).json({ ok: false, code: 'UNAUTHORIZED', message: 'Credenciales de integración inválidas.' });
    return;
  }
  next();
}
