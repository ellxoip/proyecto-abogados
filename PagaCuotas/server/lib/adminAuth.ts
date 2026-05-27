import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'superadmin@pagacuotas.demo';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Demo2026!';
const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || process.env.JWT_SECRET || 'change-this-admin-secret';
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString('base64url');
}

function signPayload(payload: string) {
  return crypto.createHmac('sha256', ADMIN_TOKEN_SECRET).update(payload).digest('base64url');
}

export function validateAdminCredentials(email: string, password: string) {
  return email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASSWORD;
}

export function createAdminToken(email: string) {
  const payload = base64Url(JSON.stringify({
    sub: email.toLowerCase(),
    role: 'admin',
    exp: Date.now() + TOKEN_TTL_MS,
  }));
  return `${payload}.${signPayload(payload)}`;
}

export function verifyAdminToken(token?: string) {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || signPayload(payload) !== signature) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!decoded.exp || decoded.exp < Date.now()) return null;
    if (decoded.role !== 'admin') return null;
    return decoded as { sub: string; role: 'admin'; exp: number };
  } catch {
    return null;
  }
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  const admin = verifyAdminToken(token);
  if (!admin) {
    res.status(401).json({ ok: false, message: 'No autorizado' });
    return;
  }
  (req as any).admin = admin;
  next();
}
