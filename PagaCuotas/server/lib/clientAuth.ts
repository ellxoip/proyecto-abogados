import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const CLIENT_TOKEN_SECRET =
  process.env.CLIENT_TOKEN_SECRET || process.env.ADMIN_TOKEN_SECRET || process.env.JWT_SECRET || 'change-this-client-secret';
const TOKEN_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString('base64url');
}

function signPayload(payload: string) {
  return crypto.createHmac('sha256', CLIENT_TOKEN_SECRET).update(payload).digest('base64url');
}

export function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase().replace(/[.\s-]/g, '');
}

export function emailsMatch(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export interface ClientTokenPayload {
  sub: string; // normalized identifier
  cliente_contable_id: string;
  email: string;
  role: 'client';
  exp: number;
}

export function createClientToken(params: { identifier: string; cliente_contable_id: string; email: string }) {
  const payload = base64Url(
    JSON.stringify({
      sub: normalizeIdentifier(params.identifier),
      cliente_contable_id: params.cliente_contable_id,
      email: params.email.trim().toLowerCase(),
      role: 'client',
      exp: Date.now() + TOKEN_TTL_MS,
    } satisfies ClientTokenPayload)
  );
  return `${payload}.${signPayload(payload)}`;
}

export function verifyClientToken(token?: string): ClientTokenPayload | null {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || signPayload(payload) !== signature) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ClientTokenPayload;
    if (!decoded.exp || decoded.exp < Date.now()) return null;
    if (decoded.role !== 'client') return null;
    return decoded;
  } catch {
    return null;
  }
}

declare module 'express-serve-static-core' {
  interface Request {
    client?: ClientTokenPayload;
  }
}

export function requireClientAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  const decoded = verifyClientToken(token);
  if (!decoded) {
    res.status(401).json({ ok: false, code: 'CLIENT_UNAUTHORIZED', message: 'Sesion invalida o expirada. Inicia sesion nuevamente.' });
    return;
  }
  req.client = decoded;
  next();
}
