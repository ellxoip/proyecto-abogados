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

type CrmClientProfileRow = {
  id: string;
  identifier: string;
  cliente_contable_id: string | null;
  crm_lead_id: string | null;
  nombre: string;
  telefono: string | null;
  email: string | null;
  rut: string;
  rut_empresa: string | null;
  empresa: string | null;
  ciudad: string | null;
  area: string | null;
  prioridad: string | null;
  vendedor: string | null;
  agendadora: string | null;
  fuente: string | null;
  total_snapshot: unknown | null;
  cuota_inicial_snap: unknown | null;
  num_cuotas: number | null;
  monto_cuota_snap: unknown | null;
  descripcion: string | null;
  notas_internas: string | null;
  magic_token: string;
  magic_token_revoked: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function toDecimal(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return new Prisma.Decimal(value);
}

export async function upsertClientFromCrm(payload: CrmClientUpsertPayload) {
  const identifier = normalizeIdentifier(payload.rut);

  const existing = await findProfileByIdentifier(identifier);

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
    ? await updateProfile(existing.id, {
        ...baseFields,
        magic_token_revoked: false,
      })
    : await createProfile({
        id: crypto.randomUUID(),
        identifier,
        magic_token: generateMagicToken(),
        ...baseFields,
      });

  return {
    profile,
    isNew: !existing,
    autoLoginUrl: buildAutoLoginUrl(profile.magic_token),
  };
}

export function buildAutoLoginUrl(magicToken: string) {
  const base = CLIENT_PORTAL_BASE_URL.replace(/\/+$/, '');
  return `${base}/client/auto-login?token=${encodeURIComponent(magicToken)}`;
}

export async function findProfileByMagicToken(token: string) {
  if (!token) return null;
  const profile = await findProfileByMagicTokenRaw(token);
  if (!profile || profile.magic_token_revoked) return null;
  return profile;
}

export async function markMagicTokenUsed(profileId: string, clienteContableId?: string) {
  await prisma.$executeRaw`
    UPDATE "CrmClientProfile"
    SET "last_login_at" = NOW(),
        "cliente_contable_id" = COALESCE(${clienteContableId ?? null}, "cliente_contable_id"),
        "updated_at" = NOW()
    WHERE "id" = ${profileId}
  `;
}

export async function markPasswordChanged(identifier: string) {
  try {
    await prisma.$executeRaw`
      UPDATE "CrmClientProfile"
      SET "password_changed_at" = NOW()
      WHERE "identifier" = ${normalizeIdentifier(identifier)}
    `;
  } catch (error: any) {
    if (isPasswordChangedColumnMissing(error)) return;
    throw error;
  }
}

export async function hasPasswordChanged(identifier: string) {
  try {
    const rows = await prisma.$queryRaw<Array<{ password_changed_at: Date | null }>>`
      SELECT "password_changed_at"
      FROM "CrmClientProfile"
      WHERE "identifier" = ${normalizeIdentifier(identifier)}
      LIMIT 1
    `;
    if (rows.length === 0) return true;
    return Boolean(rows[0]?.password_changed_at);
  } catch (error: any) {
    if (isPasswordChangedColumnMissing(error)) return false;
    throw error;
  }
}

function isPasswordChangedColumnMissing(error: any) {
  const message = String(error?.message || error?.meta?.message || '');
  return message.includes('password_changed_at') && /does not exist|no such column|no existe/i.test(message);
}

async function findProfileByIdentifier(identifier: string) {
  const rows = await prisma.$queryRaw<CrmClientProfileRow[]>`
    SELECT
      "id",
      "identifier",
      "cliente_contable_id",
      "crm_lead_id",
      "nombre",
      "telefono",
      "email",
      "rut",
      "rut_empresa",
      "empresa",
      "ciudad",
      "area",
      "prioridad",
      "vendedor",
      "agendadora",
      "fuente",
      "total_snapshot",
      "cuota_inicial_snap",
      "num_cuotas",
      "monto_cuota_snap",
      "descripcion",
      "notas_internas",
      "magic_token",
      "magic_token_revoked",
      "last_login_at",
      "created_at",
      "updated_at"
    FROM "CrmClientProfile"
    WHERE "identifier" = ${identifier}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function findProfileByMagicTokenRaw(token: string) {
  const rows = await prisma.$queryRaw<CrmClientProfileRow[]>`
    SELECT
      "id",
      "identifier",
      "cliente_contable_id",
      "crm_lead_id",
      "nombre",
      "telefono",
      "email",
      "rut",
      "rut_empresa",
      "empresa",
      "ciudad",
      "area",
      "prioridad",
      "vendedor",
      "agendadora",
      "fuente",
      "total_snapshot",
      "cuota_inicial_snap",
      "num_cuotas",
      "monto_cuota_snap",
      "descripcion",
      "notas_internas",
      "magic_token",
      "magic_token_revoked",
      "last_login_at",
      "created_at",
      "updated_at"
    FROM "CrmClientProfile"
    WHERE "magic_token" = ${token}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function createProfile(input: {
  id: string;
  identifier: string;
  magic_token: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  rut: string;
  rut_empresa: string | null;
  empresa: string | null;
  ciudad: string | null;
  area: string | null;
  prioridad: string | null;
  vendedor: string | null;
  agendadora: string | null;
  fuente: string | null;
  total_snapshot: unknown | null;
  cuota_inicial_snap: unknown | null;
  num_cuotas: number | null;
  monto_cuota_snap: unknown | null;
  descripcion: string | null;
  notas_internas: string | null;
  crm_lead_id: string | null;
}) {
  await prisma.$executeRaw`
    INSERT INTO "CrmClientProfile" (
      "id",
      "identifier",
      "cliente_contable_id",
      "crm_lead_id",
      "nombre",
      "telefono",
      "email",
      "rut",
      "rut_empresa",
      "empresa",
      "ciudad",
      "area",
      "prioridad",
      "vendedor",
      "agendadora",
      "fuente",
      "total_snapshot",
      "cuota_inicial_snap",
      "num_cuotas",
      "monto_cuota_snap",
      "descripcion",
      "notas_internas",
      "magic_token",
      "magic_token_revoked",
      "last_login_at",
      "created_at",
      "updated_at"
    ) VALUES (
      ${input.id},
      ${input.identifier},
      NULL,
      ${input.crm_lead_id},
      ${input.nombre},
      ${input.telefono},
      ${input.email},
      ${input.rut},
      ${input.rut_empresa},
      ${input.empresa},
      ${input.ciudad},
      ${input.area},
      ${input.prioridad},
      ${input.vendedor},
      ${input.agendadora},
      ${input.fuente},
      ${input.total_snapshot},
      ${input.cuota_inicial_snap},
      ${input.num_cuotas},
      ${input.monto_cuota_snap},
      ${input.descripcion},
      ${input.notas_internas},
      ${input.magic_token},
      FALSE,
      NULL,
      NOW(),
      NOW()
    )
  `;
  return findProfileByIdentifier(input.identifier);
}

async function updateProfile(id: string, input: {
  nombre: string;
  telefono: string | null;
  email: string | null;
  rut: string;
  rut_empresa: string | null;
  empresa: string | null;
  ciudad: string | null;
  area: string | null;
  prioridad: string | null;
  vendedor: string | null;
  agendadora: string | null;
  fuente: string | null;
  total_snapshot: unknown | null;
  cuota_inicial_snap: unknown | null;
  num_cuotas: number | null;
  monto_cuota_snap: unknown | null;
  descripcion: string | null;
  notas_internas: string | null;
  crm_lead_id: string | null;
  magic_token_revoked: boolean;
}) {
  await prisma.$executeRaw`
    UPDATE "CrmClientProfile"
    SET
      "nombre" = ${input.nombre},
      "telefono" = ${input.telefono},
      "email" = ${input.email},
      "rut" = ${input.rut},
      "rut_empresa" = ${input.rut_empresa},
      "empresa" = ${input.empresa},
      "ciudad" = ${input.ciudad},
      "area" = ${input.area},
      "prioridad" = ${input.prioridad},
      "vendedor" = ${input.vendedor},
      "agendadora" = ${input.agendadora},
      "fuente" = ${input.fuente},
      "total_snapshot" = ${input.total_snapshot},
      "cuota_inicial_snap" = ${input.cuota_inicial_snap},
      "num_cuotas" = ${input.num_cuotas},
      "monto_cuota_snap" = ${input.monto_cuota_snap},
      "descripcion" = ${input.descripcion},
      "notas_internas" = ${input.notas_internas},
      "crm_lead_id" = ${input.crm_lead_id},
      "magic_token_revoked" = ${input.magic_token_revoked},
      "updated_at" = NOW()
    WHERE "id" = ${id}
  `;
  return prisma.$queryRaw<CrmClientProfileRow[]>`
    SELECT
      "id",
      "identifier",
      "cliente_contable_id",
      "crm_lead_id",
      "nombre",
      "telefono",
      "email",
      "rut",
      "rut_empresa",
      "empresa",
      "ciudad",
      "area",
      "prioridad",
      "vendedor",
      "agendadora",
      "fuente",
      "total_snapshot",
      "cuota_inicial_snap",
      "num_cuotas",
      "monto_cuota_snap",
      "descripcion",
      "notas_internas",
      "magic_token",
      "magic_token_revoked",
      "last_login_at",
      "created_at",
      "updated_at"
    FROM "CrmClientProfile"
    WHERE "id" = ${id}
    LIMIT 1
  `.then((rows) => rows[0] ?? null);
}
