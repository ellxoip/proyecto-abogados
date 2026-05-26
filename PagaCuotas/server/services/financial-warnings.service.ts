/**
 * Cliente HTTP que consulta el reporte de warnings de morosidad en
 * hive-financial-control y agrega los resultados para mostrarse en el panel
 * SuperAdmin de pagaCuotas.
 *
 * Filosofía: pagaCuotas NO mantiene su propia tabla de warnings. Refleja
 * fielmente lo que financial reporta, manteniendo una única fuente de verdad.
 */
import prisma from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

export type WarningLevel = 'WARNING_10' | 'WARNING_20' | 'WARNING_30';

export type WarningSummary = {
  rut: string;
  cliente_id: number;
  cliente_nombre: string;
  max_level: WarningLevel | null;
  counts: Record<WarningLevel, number>;
  last_warning_at: string | null;
  cuotas_vencidas: number;
  saldo_vencido: number;
};

export type MorosidadOverview = {
  totals: {
    clients_with_active_warnings: number;
    saldo_vencido_total: number;
    cuotas_vencidas_total: number;
    by_level: Record<WarningLevel, number>;
  };
  clients: Array<
    WarningSummary & {
      crm_email: string | null;
      crm_telefono: string | null;
    }
  >;
};

const FINANCIAL_URL = (process.env.SIS_CONTABLE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const FINANCIAL_KEY = process.env.FINANCIAL_WARNINGS_API_KEY || '';

async function fetchWarningsByRuts(ruts: string[]): Promise<WarningSummary[]> {
  if (ruts.length === 0) return [];
  if (!FINANCIAL_KEY) {
    throw new Error('FINANCIAL_WARNINGS_API_KEY no configurada en pagaCuotas');
  }

  // El endpoint acepta hasta 200 RUTs por request — paginamos por seguridad.
  const chunks: string[][] = [];
  const size = 100;
  for (let i = 0; i < ruts.length; i += size) chunks.push(ruts.slice(i, i + size));

  const all: WarningSummary[] = [];
  for (const chunk of chunks) {
    const url = `${FINANCIAL_URL}/api/internal/integration/warnings-by-rut?ruts=${encodeURIComponent(chunk.join(','))}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${FINANCIAL_KEY}` },
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`financial ${res.status}: ${txt.slice(0, 200)}`);
    }
    const json: { ok: boolean; summaries?: WarningSummary[]; error?: string } = await res.json();
    if (!json.ok) throw new Error(json.error || 'financial respondió ok=false');
    all.push(...(json.summaries ?? []));
  }
  return all;
}

export async function getMorosidadOverview(): Promise<MorosidadOverview> {
  // 1. Universo: RUTs registrados en pagaCuotas (perfiles CRM hidratados).
  const profiles = await prisma.crmClientProfile.findMany({
    select: { rut: true, email: true, telefono: true, nombre: true },
  });

  const rutToProfile = new Map(profiles.map((p) => [p.rut.replace(/\./g, '').toLowerCase().trim(), p]));
  const uniqueRuts = Array.from(rutToProfile.keys());

  let summaries: WarningSummary[] = [];
  try {
    summaries = await fetchWarningsByRuts(uniqueRuts);
  } catch (err: any) {
    logger.error('No se pudo consultar warnings en financial: ' + (err?.message ?? String(err)));
    throw err;
  }

  // 2. Sólo nos interesan los clientes que tienen al menos un warning emitido.
  const active = summaries.filter((s) => s.max_level !== null);

  const totals: MorosidadOverview['totals'] = {
    clients_with_active_warnings: active.length,
    saldo_vencido_total: active.reduce((acc, s) => acc + (s.saldo_vencido ?? 0), 0),
    cuotas_vencidas_total: active.reduce((acc, s) => acc + (s.cuotas_vencidas ?? 0), 0),
    by_level: { WARNING_10: 0, WARNING_20: 0, WARNING_30: 0 },
  };
  for (const s of active) {
    if (s.max_level) totals.by_level[s.max_level] += 1;
  }

  // 3. Enriquecer cada cliente con datos de contacto del perfil pagaCuotas.
  const clients = active
    .map((s) => {
      const profile = rutToProfile.get(s.rut.replace(/\./g, '').toLowerCase().trim());
      return {
        ...s,
        crm_email: profile?.email ?? null,
        crm_telefono: profile?.telefono ?? null,
      };
    })
    .sort((a, b) => {
      // Mayor severidad primero, luego mayor saldo.
      const rank = (lvl: WarningLevel | null) =>
        lvl === 'WARNING_30' ? 3 : lvl === 'WARNING_20' ? 2 : lvl === 'WARNING_10' ? 1 : 0;
      const diff = rank(b.max_level) - rank(a.max_level);
      if (diff !== 0) return diff;
      return (b.saldo_vencido ?? 0) - (a.saldo_vencido ?? 0);
    });

  return { totals, clients };
}
