import { EstadoContrato, EstadoCuota, Prisma } from "@prisma/client";
import {
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  startOfMonth,
} from "date-fns";
import { prisma } from "@/lib/prisma";

export type ReportFilters = {
  from?: Date;
  to?: Date;
  estado?: string;
  servicio?: string;
  clienteId?: number;
};

export function parseReportFilters(
  searchParams: URLSearchParams | Record<string, string | string[] | undefined>,
): ReportFilters {
  const read = (key: string): string | undefined => {
    if (searchParams instanceof URLSearchParams) return searchParams.get(key) ?? undefined;
    const value = searchParams[key];
    if (Array.isArray(value)) return value[0];
    return value;
  };

  const fromRaw = read("from");
  const toRaw = read("to");
  const estado = read("estado");
  const servicio = read("servicio");
  const cliente = read("cliente");

  return {
    from: fromRaw ? new Date(fromRaw) : undefined,
    to: toRaw ? new Date(toRaw) : undefined,
    estado: estado || undefined,
    servicio: servicio || undefined,
    clienteId: cliente ? Number(cliente) : undefined,
  };
}

function contratoWhere(filters: ReportFilters): Prisma.ContratoWhereInput {
  return {
    ...(filters.estado ? { estado: filters.estado as EstadoContrato } : {}),
    ...(filters.servicio
      ? {
          tipo_servicio: {
            contains: filters.servicio,
            },
        }
      : {}),
    ...(filters.clienteId ? { cliente_id: filters.clienteId } : {}),
  };
}

export async function reportPagosRecibidos(filters: ReportFilters) {
  return prisma.pago.findMany({
    where: {
      ...(filters.from || filters.to
        ? {
            fecha_pago: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      ...(filters.clienteId ? { cliente_id: filters.clienteId } : {}),
      ...(filters.estado || filters.servicio
        ? {
            contrato: contratoWhere(filters),
          }
        : {}),
    },
    include: {
      cliente: true,
      contrato: true,
      cuota: true,
    },
    orderBy: { fecha_pago: "desc" },
  });
}

export async function reportCuentasPorCobrar(filters: ReportFilters) {
  const contratos = await prisma.contrato.findMany({
    where: contratoWhere(filters),
    include: {
      cliente: true,
      cuotas: true,
      pagos: {
        where: filters.from || filters.to
          ? {
              fecha_pago: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : undefined,
      },
    },
  });

  return contratos.map((contrato) => {
    const pagado = contrato.pagos.reduce((acc, p) => acc + Number(p.monto_pagado), 0);
    const saldoPendiente = contrato.cuotas.reduce(
      (acc, c) => acc + Number(c.saldo_pendiente),
      0,
    );
    const saldoVencido = contrato.cuotas
      .filter((c) => c.estado === EstadoCuota.VENCIDA)
      .reduce((acc, c) => acc + Number(c.saldo_pendiente), 0);

    return {
      cliente: contrato.cliente.nombre,
      rut: contrato.cliente.rut,
      servicio: contrato.tipo_servicio,
      contratoId: contrato.id,
      pagado,
      saldoPendiente,
      saldoVencido,
      cuotasPendientes: contrato.cuotas.filter(
        (c) => c.estado === EstadoCuota.PENDIENTE || c.estado === EstadoCuota.PARCIAL,
      ).length,
      cuotasVencidas: contrato.cuotas.filter((c) => c.estado === EstadoCuota.VENCIDA)
        .length,
      estado: contrato.estado,
    };
  });
}

export async function reportVencimientos(filters: ReportFilters) {
  const cuotas = await prisma.cuota.findMany({
    where: {
      ...(filters.estado ? { estado: filters.estado as EstadoCuota } : {}),
      ...(filters.from || filters.to
        ? {
            fecha_vencimiento: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      contrato: contratoWhere(filters),
    },
    include: {
      contrato: {
        include: {
          cliente: true,
        },
      },
    },
    orderBy: { fecha_vencimiento: "asc" },
  });

  const now = new Date();
  return cuotas.map((cuota) => ({
    fechaVencimiento: cuota.fecha_vencimiento,
    cliente: cuota.contrato.cliente.nombre,
    rut: cuota.contrato.cliente.rut,
    servicio: cuota.contrato.tipo_servicio,
    numeroCuota: cuota.numero_cuota,
    monto: Number(cuota.monto_actual),
    estado: cuota.estado,
    diasAtraso:
      cuota.fecha_vencimiento < now ? differenceInCalendarDays(now, cuota.fecha_vencimiento) : 0,
  }));
}

export async function reportMorosidad(filters: ReportFilters) {
  const cuotasVencidas = await prisma.cuota.findMany({
    where: {
      estado: EstadoCuota.VENCIDA,
      ...(filters.from || filters.to
        ? {
            fecha_vencimiento: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      contrato: contratoWhere(filters),
    },
    include: {
      contrato: true,
    },
  });

  const now = new Date();
  const ranges = [
    { label: "1-15", min: 1, max: 15 },
    { label: "16-30", min: 16, max: 30 },
    { label: "31-60", min: 31, max: 60 },
    { label: "60+", min: 61, max: Number.MAX_SAFE_INTEGER },
  ];

  return ranges.map((range) => {
    const items = cuotasVencidas.filter((cuota) => {
      const days = differenceInCalendarDays(now, cuota.fecha_vencimiento);
      return days >= range.min && days <= range.max;
    });

    const monto = items.reduce((acc, cuota) => acc + Number(cuota.saldo_pendiente), 0);
    const clientes = new Set(items.map((cuota) => cuota.contrato.cliente_id)).size;

    return {
      rangoDias: range.label,
      monto,
      cantidadClientes: clientes,
    };
  });
}

export async function reportProyeccionCaja(filters: ReportFilters) {
  const baseMonth = filters.from ? startOfMonth(filters.from) : startOfMonth(new Date());
  const lastMonth = filters.to ? endOfMonth(filters.to) : endOfMonth(addMonths(baseMonth, 5));

  const cuotas = await prisma.cuota.findMany({
    where: {
      fecha_vencimiento: {
        gte: baseMonth,
        lte: lastMonth,
      },
      estado: {
        in: [EstadoCuota.PENDIENTE, EstadoCuota.PARCIAL, EstadoCuota.VENCIDA],
      },
      contrato: contratoWhere(filters),
    },
    orderBy: { fecha_vencimiento: "asc" },
  });

  const vencidoRecuperableTotal = cuotas
    .filter((c) => c.estado === EstadoCuota.VENCIDA)
    .reduce((acc, c) => acc + Number(c.saldo_pendiente), 0);

  const bucket = new Map<string, number>();
  for (const cuota of cuotas) {
    const mes = format(cuota.fecha_vencimiento, "yyyy-MM");
    const current = bucket.get(mes) ?? 0;
    bucket.set(mes, current + Number(cuota.saldo_pendiente));
  }

  return Array.from(bucket.entries()).map(([mes, esperado]) => ({
    mes,
    montoEsperado: esperado,
    montoVencidoRecuperable: vencidoRecuperableTotal,
    totalProyectado: esperado + vencidoRecuperableTotal,
  }));
}

export function toCsv<T extends Record<string, unknown>>(rows: T[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const raw =
      value instanceof Date ? format(value, "yyyy-MM-dd") : value === null || value === undefined ? "" : String(value);
    const escaped = raw.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const headerLine = headers.map(escape).join(",");
  const lines = rows.map((row) => headers.map((h) => escape(row[h])).join(","));
  return [headerLine, ...lines].join("\n");
}
