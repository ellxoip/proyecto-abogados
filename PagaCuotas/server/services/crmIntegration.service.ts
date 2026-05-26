import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { normalizeIdentifier } from '../lib/clientAuth.js';

const CLIENT_PORTAL_BASE_URL = process.env.CLIENT_PORTAL_BASE_URL || 'http://localhost:3002';

export type CrmClientUpsertPayload = {
  rut: string;
  nombre: string;
  telefono?: string | null;
  email?: string | null;
  rut_empresa?: string | null;
  empresa?: string | null;
  ciudad?: string | null;
  area?: string | null;
  prioridad?: string | null;
  vendedor?: string | null;
  agendadora?: string | null;
  fuente?: string | null;
  total?: number | null;
  cuota_inicial?: number | null;
  num_cuotas?: number | null;
  monto_cuota?: number | null;
  descripcion?: string | null;
  notas_internas?: string | null;
  crm_lead_id?: string | null;
};

function generateMagicToken() {
  // 32 bytes -> 64 hex chars; opaque, unguessable, persisted as-is
  return crypto.randomBytes(32).toString('hex');
}

function toDecimal(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return new Prisma.Decimal(value);
}

export async function upsertClientFromCrm(payload: CrmClientUpsertPayload) {
  const identifier = normalizeIdentifier(payload.rut);

  const existing = await prisma.crmClientProfile.findUnique({
    where: { identifier },
  });

  const baseFields = {
    nombre: payload.nombre,
    telefono: payload.telefono ?? null,
    email: payload.email ? payload.email.trim().toLowerCase() : null,
    rut: payload.rut,
    rut_empresa: payload.rut_empresa ?? null,
    empresa: payload.empresa ?? null,
    ciudad: payload.ciudad ?? null,
    area: payload.area ?? null,
    prioridad: payload.prioridad ?? null,
    vendedor: payload.vendedor ?? null,
    agendadora: payload.agendadora ?? null,
    fuente: payload.fuente ?? null,
    total_snapshot: toDecimal(payload.total),
    cuota_inicial_snap: toDecimal(payload.cuota_inicial),
    num_cuotas: payload.num_cuotas ?? null,
    monto_cuota_snap: toDecimal(payload.monto_cuota),
    descripcion: payload.descripcion ?? null,
    notas_internas: payload.notas_internas ?? null,
    crm_lead_id: payload.crm_lead_id ?? null,
  };

  const profile = existing
    ? await prisma.crmClientProfile.update({
        where: { id: existing.id },
        data: {
          ...baseFields,
          // Si fue revocado, al re-pushear lo re-habilitamos.
          magic_token_revoked: false,
        },
      })
    : await prisma.crmClientProfile.create({
        data: {
          identifier,
          magic_token: generateMagicToken(),
          ...baseFields,
        },
      });

  return {
    profile,
    isNew: !existing,
    autoLoginUrl: buildAutoLoginUrl(profile.magic_token),
  };
}

export function buildAutoLoginUrl(magicToken: string) {
  const base = CLIENT_PORTAL_BASE_URL.replace(/\/+$/, '');
  return `${base}/client/auto-login?token=${encodeURIComponent(magicToken)}&pay=1`;
}

export async function findProfileByMagicToken(token: string) {
  if (!token) return null;
  const profile = await prisma.crmClientProfile.findUnique({
    where: { magic_token: token },
  });
  if (!profile || profile.magic_token_revoked) return null;
  return profile;
}

export async function markMagicTokenUsed(profileId: string, clienteContableId?: string) {
  await prisma.crmClientProfile.update({
    where: { id: profileId },
    data: {
      last_login_at: new Date(),
      ...(clienteContableId ? { cliente_contable_id: clienteContableId } : {}),
    },
  });
}
