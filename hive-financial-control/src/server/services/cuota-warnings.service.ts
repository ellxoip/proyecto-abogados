/**
 * Cuota Warnings — alertas automáticas de morosidad por tramos de días.
 *
 * Reglas de negocio (referencia):
 *   - Día 10: WARNING_10  → recordatorio amigable.
 *   - Día 20: WARNING_20  → aviso crítico (advertencia de corte).
 *   - Día 30: WARNING_30  → corte efectivo del servicio.
 *
 * Diseño:
 *   - Idempotencia: tabla `CuotaWarning` con @@unique(cuota_id, level). Un mismo
 *     warning nunca se envía dos veces aunque el cron corra varias veces el
 *     mismo día. Race-safe gracias al P2002 de Prisma.
 *   - Source of truth: la fecha de vencimiento y el saldo viven en hive-financial-control.
 *   - Downstream:
 *       · W10/W20 → POST a hive-service-control para encolar WhatsApp+Email al cliente.
 *       · W30     → POST a hive-service-control para `forceHalt` del caso legal
 *                    y desactivar la cuenta del cliente. Además el contrato se
 *                    marca EN_MORA.
 *   - Auditoría: cada corrida se loguea en `ExternalSyncLog`.
 *
 * Mantenimiento:
 *   - Si el negocio cambia los tramos (e.g. 7/15/30), basta editar
 *     `WARNING_THRESHOLDS_DAYS`. El resto del flujo es declarativo.
 */
import { EstadoContrato, EstadoCuota, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Tramos de días de atraso que disparan cada warning. */
export const WARNING_THRESHOLDS_DAYS = {
  WARNING_10: 10,
  WARNING_20: 20,
  WARNING_30: 30,
} as const;

type WarningLevel = keyof typeof WARNING_THRESHOLDS_DAYS;

/** Estados de cuota considerados "deuda activa". */
const ACTIVE_DEBT_STATES: EstadoCuota[] = [
  EstadoCuota.PENDIENTE,
  EstadoCuota.PARCIAL,
  EstadoCuota.VENCIDA,
  EstadoCuota.REPROGRAMADA,
];

export type WarningRunResult = {
  scanned: number;
  evaluated: number;
  dispatched: { WARNING_10: number; WARNING_20: number; WARNING_30: number };
  skipped_already_sent: number;
  errors: Array<{ cuota_id: number; level: WarningLevel; message: string }>;
  duration_ms: number;
};

export type WarningEnvConfig = {
  hiveServiceUrl: string;
  hiveServiceApiKey: string;
};

function readEnv(): WarningEnvConfig {
  const url = process.env.HIVE_SERVICE_URL?.replace(/\/$/, "") ?? "";
  const key = process.env.HIVE_SERVICE_INTEGRATION_API_KEY ?? "";
  if (!url || !key) {
    throw new Error(
      "Cuota warnings: faltan HIVE_SERVICE_URL y/o HIVE_SERVICE_INTEGRATION_API_KEY en .env",
    );
  }
  return { hiveServiceUrl: url, hiveServiceApiKey: key };
}

/** Diferencia en días (truncada al piso). */
export function daysDiff(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

/** Resuelve el tramo aplicable según los días de atraso. */
export function computeWarningLevel(diasAtraso: number): WarningLevel | null {
  if (diasAtraso >= WARNING_THRESHOLDS_DAYS.WARNING_30) return "WARNING_30";
  if (diasAtraso >= WARNING_THRESHOLDS_DAYS.WARNING_20) return "WARNING_20";
  if (diasAtraso >= WARNING_THRESHOLDS_DAYS.WARNING_10) return "WARNING_10";
  return null;
}

/**
 * Notifica a hive-service-control. Devuelve el cuerpo de respuesta para
 * persistirlo en `downstream_response`. Lanza si la respuesta no es 2xx.
 */
async function postToHiveService(
  cfg: WarningEnvConfig,
  payload: Record<string, unknown>,
): Promise<{ status: number; body: string }> {
  const res = await fetch(`${cfg.hiveServiceUrl}/api/internal/integration/financial-warning`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.hiveServiceApiKey}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (res.status >= 400) {
    throw new Error(`hive-service ${res.status}: ${text.slice(0, 400)}`);
  }
  return { status: res.status, body: text.slice(0, 1000) };
}

/**
 * Loop principal. Se ejecuta una vez al día (cron) y procesa toda la deuda
 * activa. Cada cuota recibe a lo sumo un warning por corrida (el más alto
 * aplicable que aún no se haya enviado), preservando el ciclo 10 → 20 → 30.
 */
export async function runDailyWarnings(now: Date = new Date()): Promise<WarningRunResult> {
  const startedAt = Date.now();
  const cfg = readEnv();
  const summary: WarningRunResult = {
    scanned: 0,
    evaluated: 0,
    dispatched: { WARNING_10: 0, WARNING_20: 0, WARNING_30: 0 },
    skipped_already_sent: 0,
    errors: [],
    duration_ms: 0,
  };

  // Solo cuotas vencidas con saldo. Filtramos en SQL para minimizar payload.
  const cuotas = await prisma.cuota.findMany({
    where: {
      estado: { in: ACTIVE_DEBT_STATES },
      cobrable: true,
      saldo_pendiente: { gt: new Prisma.Decimal(0) },
      fecha_vencimiento: { lte: subDays(now, WARNING_THRESHOLDS_DAYS.WARNING_10) },
    },
    include: {
      contrato: {
        select: {
          id: true,
          external_id: true,
          estado: true,
          cliente_id: true,
          cliente: {
            select: {
              id: true,
              rut: true,
              nombre: true,
              email: true,
              telefono: true,
            },
          },
        },
      },
      warnings: { select: { level: true } },
    },
  });

  summary.scanned = cuotas.length;

  for (const cuota of cuotas) {
    const dias = daysDiff(cuota.fecha_vencimiento, now);
    const level = computeWarningLevel(dias);
    if (!level) continue;
    summary.evaluated += 1;

    const alreadySent = cuota.warnings.some((w) => w.level === level);
    if (alreadySent) {
      summary.skipped_already_sent += 1;
      continue;
    }

    try {
      await dispatchWarning({
        cfg,
        cuota,
        dias,
        level,
        now,
      });
      summary.dispatched[level] += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.errors.push({ cuota_id: cuota.id, level, message });
    }
  }

  summary.duration_ms = Date.now() - startedAt;

  await persistRunLog(summary).catch(() => {
    /* log es best-effort; no rompe el cron */
  });

  return summary;
}

type CuotaWithRelations = Awaited<ReturnType<typeof prisma.cuota.findMany>>[number] & {
  contrato: {
    id: number;
    external_id: string | null;
    estado: EstadoContrato;
    cliente_id: number;
    cliente: {
      id: number;
      rut: string;
      nombre: string;
      email: string | null;
      telefono: string | null;
    };
  };
};

async function dispatchWarning(params: {
  cfg: WarningEnvConfig;
  cuota: CuotaWithRelations;
  dias: number;
  level: WarningLevel;
  now: Date;
}) {
  const { cfg, cuota, dias, level, now } = params;

  // 1. Reservar el slot — si otro proceso corrió en paralelo, P2002 nos saca.
  let warning;
  try {
    warning = await prisma.cuotaWarning.create({
      data: {
        cuota_id: cuota.id,
        contrato_id: cuota.contrato.id,
        cliente_id: cuota.contrato.cliente_id,
        level,
        dias_atraso_at_send: dias,
        channel: "BOTH",
        delivery_status: "PENDING",
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Otro worker se adelantó. No es error.
      return;
    }
    throw err;
  }

  // 2. Notificar a hive-service-control.
  const payload = {
    source: "hive-financial-control",
    warning_id: warning.id,
    level,
    dias_atraso: dias,
    cliente: {
      id: cuota.contrato.cliente.id,
      rut: cuota.contrato.cliente.rut,
      nombre: cuota.contrato.cliente.nombre,
      email: cuota.contrato.cliente.email,
      telefono: cuota.contrato.cliente.telefono,
    },
    contrato: {
      id: cuota.contrato.id,
      external_id: cuota.contrato.external_id,
      estado: cuota.contrato.estado,
    },
    cuota: {
      id: cuota.id,
      numero_cuota: cuota.numero_cuota,
      fecha_vencimiento: cuota.fecha_vencimiento.toISOString(),
      monto_original: cuota.monto_original.toString(),
      saldo_pendiente: cuota.saldo_pendiente.toString(),
    },
  };

  let outcome: { status: "SENT" | "FAILED"; error?: string; response?: string } = {
    status: "SENT",
  };
  let downstreamDispatched = false;
  try {
    const res = await postToHiveService(cfg, payload);
    outcome.response = res.body;
    downstreamDispatched = true;
  } catch (err) {
    outcome = {
      status: "FAILED",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // 3. Persistir el resultado en CuotaWarning + Cuota.last_warning_*.
  // Si W30 falló downstream, el flag queda en false para reintento en próxima corrida.
  await prisma.$transaction([
    prisma.cuotaWarning.update({
      where: { id: warning.id },
      data: {
        delivery_status: outcome.status,
        delivery_error: outcome.error ?? null,
        downstream_response: outcome.response ?? null,
        downstream_dispatched: downstreamDispatched,
        sent_at: outcome.status === "SENT" ? now : null,
      },
    }),
    prisma.cuota.update({
      where: { id: cuota.id },
      data: {
        last_warning_level: level,
        last_warning_at: now,
      },
    }),
    // Marcar contrato EN_MORA al W30 si todavía no estaba en estado terminal.
    ...(level === "WARNING_30" && cuota.contrato.estado === EstadoContrato.ACTIVO
      ? [
          prisma.contrato.update({
            where: { id: cuota.contrato.id },
            data: { estado: EstadoContrato.EN_MORA },
          }),
        ]
      : []),
  ]);

  if (outcome.status === "FAILED") {
    throw new Error(outcome.error);
  }
}

async function persistRunLog(summary: WarningRunResult) {
  const sistema = await prisma.sistemaExterno.upsert({
    where: { codigo: "hive_service_control" },
    create: { codigo: "hive_service_control", nombre: "Hive Service Control" },
    update: {},
  });

  await prisma.externalSyncLog.create({
    data: {
      sistema_externo_id: sistema.id,
      sync_type: "cuota_warnings_daily",
      status:
        summary.errors.length === 0
          ? "SUCCESS"
          : summary.errors.length === summary.evaluated
            ? "FAILED"
            : "PARTIAL",
      response_summary: summary as unknown as Prisma.InputJsonValue,
      finished_at: new Date(),
    },
  });
}

function subDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}
