import { EstadoContrato, EstadoCuota } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type CuotaUiEstado =
  | "PAGADA"
  | "PENDIENTE"
  | "VENCIDA"
  | "PAGO_PARCIAL"
  | "EN_REVISION"
  | "ANULADA";

export type EstadoFinanciero =
  | "AL_DIA"
  | "CON_DEUDA"
  | "MOROSO"
  | "PAGADO"
  | "EN_REVISION";

type CuotaLite = {
  id: number;
  numero_cuota: number;
  fecha_vencimiento: Date;
  monto_actual: unknown;
  monto_pagado: unknown;
  saldo_pendiente: unknown;
  estado: EstadoCuota;
  fecha_pago: Date | null;
};

type PagoLite = {
  id: number;
  monto_pagado: unknown;
  fecha_pago: Date;
  medio_pago: string;
  referencia: string | null;
  observacion: string | null;
  cuota_id: number | null;
};

type ContratoLite = {
  id: number;
  external_id: string | null;
  tipo_servicio: string;
  estado: EstadoContrato;
  monto_ccto: unknown;
  fecha_contrato: Date;
  cuotas: CuotaLite[];
  pagos: PagoLite[];
};

type ClienteLite = {
  id: number;
  nombre: string;
  rut: string;
  contratos: ContratoLite[];
};

export type ContratoResumen = {
  id: number;
  codigo: string;
  servicio: string;
  fechaContrato: string;
  totalContrato: number;
  totalPagado: number;
  saldoPendiente: number;
  cuotasPagadas: number;
  cuotasPendientes: number;
  cuotasVencidas: number;
  estadoContrato: EstadoContrato;
  estadoFinanciero: EstadoFinanciero;
};

export type ClienteCuotasResumen = {
  id: number;
  nombre: string;
  rut: string;
  cantidadServicios: number;
  totalContratado: number;
  totalPagado: number;
  saldoPendiente: number;
  estadoFinanciero: EstadoFinanciero;
  contratos: ContratoResumen[];
};

export type CuotasOverviewResponse = {
  generatedAt: string;
  clientes: ClienteCuotasResumen[];
};

export type CuotaDetalle = {
  id: number;
  numeroCuota: number;
  fechaVencimiento: string;
  montoCuota: number;
  montoPagado: number;
  saldo: number;
  estado: CuotaUiEstado;
  fechaPago: string | null;
  acciones: string[];
};

export type ContratoDetalleResponse = {
  contratoId: number;
  cliente: {
    id: number;
    nombre: string;
    rut: string;
  };
  contrato: {
    id: number;
    codigo: string;
    servicio: string;
    estadoContrato: EstadoContrato;
    estadoFinanciero: EstadoFinanciero;
    fechaContrato: string;
  };
  resumen: {
    totalContrato: number;
    totalPagado: number;
    saldoPendiente: number;
    cuotasTotales: number;
    cuotasPagadas: number;
    cuotasPorPagar: number;
    cuotasVencidas: number;
    proximoVencimiento: string | null;
  };
  cuotas: CuotaDetalle[];
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString(): string }).toString());
  }
  return 0;
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function toCuotaUiEstado(
  cuota: Pick<CuotaLite, "estado" | "saldo_pendiente">,
): CuotaUiEstado {
  const saldo = toNumber(cuota.saldo_pendiente);

  if (cuota.estado === EstadoCuota.ANULADA) return "ANULADA";
  if (cuota.estado === EstadoCuota.PAGADA || saldo <= 0) return "PAGADA";
  if (cuota.estado === EstadoCuota.VENCIDA) return "VENCIDA";
  if (cuota.estado === EstadoCuota.PENDIENTE) return "PENDIENTE";
  if (cuota.estado === EstadoCuota.PARCIAL) return "PAGO_PARCIAL";

  return "EN_REVISION";
}

function computeInstallmentCounters(cuotas: CuotaLite[], now: Date) {
  let cuotasPagadas = 0;
  let cuotasPendientes = 0;
  let cuotasVencidas = 0;

  for (const cuota of cuotas) {
    const saldo = toNumber(cuota.saldo_pendiente);
    const estadoUi = toCuotaUiEstado(cuota);

    if (estadoUi === "ANULADA" || estadoUi === "EN_REVISION") {
      continue;
    }

    if (saldo <= 0 || estadoUi === "PAGADA") {
      cuotasPagadas += 1;
      continue;
    }

    if (estadoUi === "VENCIDA" || cuota.fecha_vencimiento < now) {
      cuotasVencidas += 1;
      continue;
    }

    cuotasPendientes += 1;
  }

  return { cuotasPagadas, cuotasPendientes, cuotasVencidas };
}

function computeContractFinancialState(input: {
  saldoPendiente: number;
  totalPagado: number;
  cuotasVencidas: number;
  hasRevision: boolean;
}): EstadoFinanciero {
  if (input.hasRevision) return "EN_REVISION";
  if (input.saldoPendiente <= 0) return "PAGADO";
  if (input.cuotasVencidas > 0) return "MOROSO";
  if (input.totalPagado > 0) return "AL_DIA";
  return "CON_DEUDA";
}

export function summarizeContract(
  contrato: ContratoLite,
  now = new Date(),
): ContratoResumen {
  const totalContrato = toNumber(contrato.monto_ccto);
  const totalPagado = contrato.pagos.reduce(
    (acc, pago) => acc + toNumber(pago.monto_pagado),
    0,
  );
  const saldoPendiente = contrato.cuotas.reduce(
    (acc, cuota) => acc + toNumber(cuota.saldo_pendiente),
    0,
  );

  const { cuotasPagadas, cuotasPendientes, cuotasVencidas } =
    computeInstallmentCounters(contrato.cuotas, now);

  const hasRevision =
    contrato.estado === EstadoContrato.REPACTADO ||
    contrato.cuotas.some((cuota) => toCuotaUiEstado(cuota) === "EN_REVISION");

  return {
    id: contrato.id,
    codigo: contrato.external_id ?? `CTR-${contrato.id}`,
    servicio: contrato.tipo_servicio,
    fechaContrato: toIsoDate(contrato.fecha_contrato),
    totalContrato,
    totalPagado,
    saldoPendiente,
    cuotasPagadas,
    cuotasPendientes,
    cuotasVencidas,
    estadoContrato: contrato.estado,
    estadoFinanciero: computeContractFinancialState({
      saldoPendiente,
      totalPagado,
      cuotasVencidas,
      hasRevision,
    }),
  };
}

export function summarizeClient(
  cliente: ClienteLite,
  now = new Date(),
): ClienteCuotasResumen {
  const contratos = cliente.contratos.map((contrato) => summarizeContract(contrato, now));

  const totalContratado = contratos.reduce(
    (acc, contrato) => acc + contrato.totalContrato,
    0,
  );
  const totalPagado = contratos.reduce((acc, contrato) => acc + contrato.totalPagado, 0);
  const saldoPendiente = contratos.reduce(
    (acc, contrato) => acc + contrato.saldoPendiente,
    0,
  );

  const hasRevision = contratos.some((contrato) => contrato.estadoFinanciero === "EN_REVISION");
  const hasMoroso = contratos.some((contrato) => contrato.estadoFinanciero === "MOROSO");
  const anyPago = totalPagado > 0;

  let estadoFinanciero: EstadoFinanciero;
  if (hasRevision) {
    estadoFinanciero = "EN_REVISION";
  } else if (saldoPendiente <= 0) {
    estadoFinanciero = "PAGADO";
  } else if (hasMoroso) {
    estadoFinanciero = "MOROSO";
  } else if (anyPago) {
    estadoFinanciero = "AL_DIA";
  } else {
    estadoFinanciero = "CON_DEUDA";
  }

  return {
    id: cliente.id,
    nombre: cliente.nombre,
    rut: cliente.rut,
    cantidadServicios: contratos.length,
    totalContratado,
    totalPagado,
    saldoPendiente,
    estadoFinanciero,
    contratos,
  };
}

function availableInstallmentActions(estado: CuotaUiEstado): string[] {
  if (estado === "PAGADA") {
    return ["Ver pago", "Ver historial"];
  }
  if (estado === "ANULADA") {
    return ["Ver historial"];
  }
  if (estado === "EN_REVISION") {
    return ["Ver historial"];
  }

  return ["Registrar pago", "Marcar en revision", "Ver historial"];
}

export async function getCuotasOverview(now = new Date()): Promise<CuotasOverviewResponse> {
  const clientes = await prisma.cliente.findMany({
    orderBy: { nombre: "asc" },
    select: {
      id: true,
      nombre: true,
      rut: true,
      contratos: {
        orderBy: { fecha_contrato: "desc" },
        select: {
          id: true,
          external_id: true,
          tipo_servicio: true,
          estado: true,
          monto_ccto: true,
          fecha_contrato: true,
          cuotas: {
            select: {
              id: true,
              numero_cuota: true,
              fecha_vencimiento: true,
              monto_actual: true,
              monto_pagado: true,
              saldo_pendiente: true,
              estado: true,
              fecha_pago: true,
            },
          },
          pagos: {
            select: {
              id: true,
              monto_pagado: true,
              fecha_pago: true,
              medio_pago: true,
              referencia: true,
              observacion: true,
              cuota_id: true,
            },
          },
        },
      },
    },
  });

  return {
    generatedAt: new Date().toISOString(),
    clientes: clientes.map((cliente) => summarizeClient(cliente, now)),
  };
}

export async function getContratoCuotasDetalle(
  contratoId: number,
  now = new Date(),
): Promise<ContratoDetalleResponse | null> {
  const contrato = await prisma.contrato.findUnique({
    where: { id: contratoId },
    select: {
      id: true,
      external_id: true,
      tipo_servicio: true,
      estado: true,
      monto_ccto: true,
      fecha_contrato: true,
      cliente: {
        select: {
          id: true,
          nombre: true,
          rut: true,
        },
      },
      cuotas: {
        orderBy: { numero_cuota: "asc" },
        select: {
          id: true,
          numero_cuota: true,
          fecha_vencimiento: true,
          monto_actual: true,
          monto_pagado: true,
          saldo_pendiente: true,
          estado: true,
          fecha_pago: true,
        },
      },
      pagos: {
        orderBy: { fecha_pago: "desc" },
        select: {
          id: true,
          monto_pagado: true,
          fecha_pago: true,
          medio_pago: true,
          referencia: true,
          observacion: true,
          cuota_id: true,
        },
      },
    },
  });

  if (!contrato) return null;

  const resumenContrato = summarizeContract(contrato, now);

  const cuotas = contrato.cuotas.map((cuota) => {
    const estado = toCuotaUiEstado(cuota);

    return {
      id: cuota.id,
      numeroCuota: cuota.numero_cuota,
      fechaVencimiento: toIsoDate(cuota.fecha_vencimiento),
      montoCuota: toNumber(cuota.monto_actual),
      montoPagado: toNumber(cuota.monto_pagado),
      saldo: toNumber(cuota.saldo_pendiente),
      estado,
      fechaPago: cuota.fecha_pago ? toIsoDate(cuota.fecha_pago) : null,
      acciones: availableInstallmentActions(estado),
    } satisfies CuotaDetalle;
  });

  const pendientesFuturas = contrato.cuotas
    .filter(
      (cuota) =>
        toNumber(cuota.saldo_pendiente) > 0 &&
        cuota.fecha_vencimiento >= now &&
        toCuotaUiEstado(cuota) !== "ANULADA" &&
        toCuotaUiEstado(cuota) !== "EN_REVISION",
    )
    .sort((a, b) => a.fecha_vencimiento.getTime() - b.fecha_vencimiento.getTime());

  const { cuotasPagadas, cuotasPendientes, cuotasVencidas } = resumenContrato;

  return {
    contratoId: contrato.id,
    cliente: {
      id: contrato.cliente.id,
      nombre: contrato.cliente.nombre,
      rut: contrato.cliente.rut,
    },
    contrato: {
      id: contrato.id,
      codigo: contrato.external_id ?? `CTR-${contrato.id}`,
      servicio: contrato.tipo_servicio,
      estadoContrato: contrato.estado,
      estadoFinanciero: resumenContrato.estadoFinanciero,
      fechaContrato: toIsoDate(contrato.fecha_contrato),
    },
    resumen: {
      totalContrato: resumenContrato.totalContrato,
      totalPagado: resumenContrato.totalPagado,
      saldoPendiente: resumenContrato.saldoPendiente,
      cuotasTotales: contrato.cuotas.length,
      cuotasPagadas,
      cuotasPorPagar: cuotasPendientes,
      cuotasVencidas,
      proximoVencimiento:
        pendientesFuturas.length > 0
          ? toIsoDate(pendientesFuturas[0].fecha_vencimiento)
          : null,
    },
    cuotas,
  };
}
