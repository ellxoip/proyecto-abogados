/**
 * Lecturas agregadas del estado real de warnings de morosidad.
 *
 * Consumido por:
 *   - Reporte interno `/reportes/morosidad` (este mismo sistema).
 *   - Endpoint público `/api/internal/integration/warnings-by-rut` que
 *     hive-service-control llama para reflejar fielmente el estado en su
 *     propio dashboard de mora.
 *
 * Filosofía: `CuotaWarning` es la fuente única de verdad. Cualquier conteo,
 * resumen o badge de severidad se calcula a partir de aquí, no de campos
 * derivados (case.unpaid_months, halted_at, etc).
 */
import { CuotaWarningLevel, EstadoCuota, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const ACTIVE_DEBT_STATES: EstadoCuota[] = [
  EstadoCuota.PENDIENTE,
  EstadoCuota.PARCIAL,
  EstadoCuota.VENCIDA,
  EstadoCuota.REPROGRAMADA,
];

export type WarningLevelStr = "WARNING_10" | "WARNING_20" | "WARNING_30";

/** Severidad ordinal — útil para "máximo nivel" y comparaciones. */
const LEVEL_RANK: Record<WarningLevelStr, number> = {
  WARNING_10: 10,
  WARNING_20: 20,
  WARNING_30: 30,
};

export type WarningSummary = {
  rut: string;
  cliente_id: number;
  cliente_nombre: string;
  max_level: WarningLevelStr | null;
  counts: Record<WarningLevelStr, number>;
  last_warning_at: string | null;
  cuotas_vencidas: number;
  saldo_vencido: number;
};

/** Resumen global del cron — para stats top del dashboard. */
export type GlobalWarningStats = {
  total_warnings_last_30d: Record<WarningLevelStr, number>;
  active_clients_at_level: Record<WarningLevelStr, number>;
  total_saldo_vencido: number;
  total_cuotas_vencidas: number;
};

function emptyLevelCounts(): Record<WarningLevelStr, number> {
  return { WARNING_10: 0, WARNING_20: 0, WARNING_30: 0 };
}

/**
 * Devuelve un resumen por RUT con: máximo nivel emitido, conteo por nivel,
 * última fecha de envío, cuotas vencidas y saldo total vencido.
 */
export async function getWarningSummaryByRuts(ruts: string[]): Promise<WarningSummary[]> {
  if (ruts.length === 0) return [];
  const normalized = ruts.map((r) => r.replace(/\./g, "").toLowerCase().trim());

  const clientes = await prisma.cliente.findMany({
    where: { rut: { in: normalized } },
    select: {
      id: true,
      rut: true,
      nombre: true,
      contratos: {
        select: {
          cuotas: {
            where: {
              estado: { in: ACTIVE_DEBT_STATES },
              cobrable: true,
              saldo_pendiente: { gt: new Prisma.Decimal(0) },
            },
            select: {
              id: true,
              saldo_pendiente: true,
              fecha_vencimiento: true,
              warnings: {
                select: { level: true, sent_at: true, created_at: true },
              },
            },
          },
        },
      },
    },
  });

  return clientes.map((c) => {
    const counts = emptyLevelCounts();
    let maxLevel: WarningLevelStr | null = null;
    let lastWarningAt: Date | null = null;
    let cuotasVencidas = 0;
    let saldoVencido = 0;

    for (const contrato of c.contratos) {
      for (const cuota of contrato.cuotas) {
        cuotasVencidas += 1;
        saldoVencido += cuota.saldo_pendiente.toNumber();
        for (const w of cuota.warnings) {
          counts[w.level as WarningLevelStr] += 1;
          const wAt = w.sent_at ?? w.created_at;
          if (!lastWarningAt || wAt > lastWarningAt) lastWarningAt = wAt;
          if (!maxLevel || LEVEL_RANK[w.level as WarningLevelStr] > LEVEL_RANK[maxLevel]) {
            maxLevel = w.level as WarningLevelStr;
          }
        }
      }
    }

    return {
      rut: c.rut,
      cliente_id: c.id,
      cliente_nombre: c.nombre,
      max_level: maxLevel,
      counts,
      last_warning_at: lastWarningAt?.toISOString() ?? null,
      cuotas_vencidas: cuotasVencidas,
      saldo_vencido: saldoVencido,
    };
  });
}

/**
 * Stats globales para el reporte de morosidad.
 * Se calcula sobre los últimos 30 días para no inflar contadores históricos.
 */
export async function getGlobalWarningStats(): Promise<GlobalWarningStats> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

  const counts = await prisma.cuotaWarning.groupBy({
    by: ["level"],
    where: { created_at: { gte: thirtyDaysAgo } },
    _count: { _all: true },
  });

  const totals = emptyLevelCounts();
  for (const row of counts) {
    totals[row.level as WarningLevelStr] = row._count._all;
  }

  // Clientes con al menos un warning activo de cada nivel (deuda no regularizada).
  const activeByLevel: Record<WarningLevelStr, number> = emptyLevelCounts();
  for (const level of Object.keys(activeByLevel) as WarningLevelStr[]) {
    const distinct = await prisma.cuotaWarning.findMany({
      where: {
        level: level as CuotaWarningLevel,
        cuota: {
          estado: { in: ACTIVE_DEBT_STATES },
          cobrable: true,
          saldo_pendiente: { gt: new Prisma.Decimal(0) },
        },
      },
      select: { cliente_id: true },
      distinct: ["cliente_id"],
    });
    activeByLevel[level] = distinct.length;
  }

  // Totales generales de cuotas vencidas / saldo.
  const vencidas = await prisma.cuota.findMany({
    where: {
      estado: { in: ACTIVE_DEBT_STATES },
      cobrable: true,
      saldo_pendiente: { gt: new Prisma.Decimal(0) },
      fecha_vencimiento: { lt: new Date() },
    },
    select: { saldo_pendiente: true },
  });

  return {
    total_warnings_last_30d: totals,
    active_clients_at_level: activeByLevel,
    total_saldo_vencido: vencidas.reduce((acc, v) => acc + v.saldo_pendiente.toNumber(), 0),
    total_cuotas_vencidas: vencidas.length,
  };
}

/**
 * Detalle de cuotas con warning activo. Para el reporte detallado.
 * Devuelve cuotas con su mayor warning enviado y el saldo pendiente.
 */
export type CuotaConWarning = {
  cuota_id: number;
  cliente_id: number;
  cliente_rut: string;
  cliente_nombre: string;
  contrato_id: number;
  numero_cuota: number;
  fecha_vencimiento: string;
  dias_atraso: number;
  saldo_pendiente: number;
  last_warning_level: WarningLevelStr | null;
  last_warning_at: string | null;
  warnings_enviados: number;
};

export async function getCuotasConWarning(): Promise<CuotaConWarning[]> {
  const now = new Date();
  const cuotas = await prisma.cuota.findMany({
    where: {
      estado: { in: ACTIVE_DEBT_STATES },
      cobrable: true,
      saldo_pendiente: { gt: new Prisma.Decimal(0) },
      fecha_vencimiento: { lt: now },
    },
    include: {
      warnings: { orderBy: { created_at: "desc" }, select: { level: true, created_at: true, sent_at: true } },
      contrato: {
        select: { id: true, cliente: { select: { id: true, rut: true, nombre: true } } },
      },
    },
    orderBy: { fecha_vencimiento: "asc" },
  });

  return cuotas.map((c) => {
    const last = c.warnings[0];
    return {
      cuota_id: c.id,
      cliente_id: c.contrato.cliente.id,
      cliente_rut: c.contrato.cliente.rut,
      cliente_nombre: c.contrato.cliente.nombre,
      contrato_id: c.contrato.id,
      numero_cuota: c.numero_cuota,
      fecha_vencimiento: c.fecha_vencimiento.toISOString(),
      dias_atraso: Math.floor((now.getTime() - c.fecha_vencimiento.getTime()) / 86_400_000),
      saldo_pendiente: c.saldo_pendiente.toNumber(),
      last_warning_level: (last?.level as WarningLevelStr) ?? null,
      last_warning_at: (last?.sent_at ?? last?.created_at)?.toISOString() ?? null,
      warnings_enviados: c.warnings.length,
    };
  });
}
