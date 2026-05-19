import { EstadoContrato, EstadoCuota } from "@prisma/client";
import { addMonths } from "date-fns";
import { InstallmentInput, PaymentAllocation } from "./financial.types";

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function generateInstallmentPlan(
  saldoFinanciado: number,
  cantidadCuotas: number,
  fechaPrimeraCuota: Date,
) {
  if (cantidadCuotas <= 0) {
    throw new Error("La cantidad de cuotas debe ser mayor a cero.");
  }

  const cuotaBase = roundMoney(saldoFinanciado / cantidadCuotas);
  const cuotas = [];
  let acumulado = 0;

  for (let index = 0; index < cantidadCuotas; index += 1) {
    const numeroCuota = index + 1;
    const isLast = numeroCuota === cantidadCuotas;
    const monto = isLast
      ? roundMoney(saldoFinanciado - acumulado)
      : cuotaBase;

    acumulado = roundMoney(acumulado + monto);

    cuotas.push({
      numero_cuota: numeroCuota,
      fecha_vencimiento: addMonths(fechaPrimeraCuota, index),
      monto_original: monto,
      monto_actual: monto,
      monto_pagado: 0,
      saldo_pendiente: monto,
      estado: EstadoCuota.PENDIENTE,
    });
  }

  return cuotas;
}

function installmentStateFromBalance(
  saldoPendiente: number,
  fechaVencimiento: Date,
  now: Date,
): EstadoCuota {
  if (saldoPendiente <= 0) {
    return EstadoCuota.PAGADA;
  }

  const vencida = fechaVencimiento < now;
  return vencida ? EstadoCuota.VENCIDA : EstadoCuota.PENDIENTE;
}

export function applyPaymentToInstallments(
  installments: InstallmentInput[],
  montoPago: number,
  now = new Date(),
): { allocations: PaymentAllocation[]; abonoNoAplicado: number } {
  let restante = roundMoney(montoPago);
  const allocations: PaymentAllocation[] = [];

  const ordered = [...installments].sort(
    (a, b) => a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime(),
  );

  for (const cuota of ordered) {
    if (restante <= 0) {
      break;
    }
    if (cuota.saldoPendiente <= 0) {
      continue;
    }

    const aplicado = Math.min(restante, cuota.saldoPendiente);
    const saldoRestanteCuota = roundMoney(cuota.saldoPendiente - aplicado);
    allocations.push({
      cuotaId: cuota.id,
      montoAplicado: roundMoney(aplicado),
      saldoRestanteCuota,
      estadoCuota:
        saldoRestanteCuota > 0
          ? EstadoCuota.PARCIAL
          : installmentStateFromBalance(saldoRestanteCuota, cuota.fechaVencimiento, now),
    });

    restante = roundMoney(restante - aplicado);
  }

  return {
    allocations,
    abonoNoAplicado: restante,
  };
}

export function calculateContractState(
  installments: { saldoPendiente: number; fechaVencimiento: Date }[],
  now = new Date(),
): EstadoContrato {
  const hasPendingBalance = installments.some((item) => item.saldoPendiente > 0);
  if (!hasPendingBalance) {
    return EstadoContrato.PAGADO;
  }

  const hasOverdue = installments.some(
    (item) => item.saldoPendiente > 0 && item.fechaVencimiento < now,
  );
  return hasOverdue ? EstadoContrato.EN_MORA : EstadoContrato.ACTIVO;
}

export function selectInstallmentsToReplaceForRepactation(
  installments: {
    id: number;
    fechaVencimiento: Date;
    saldoPendiente: number;
    estado: EstadoCuota;
  }[],
  now = new Date(),
) {
  return installments.filter(
    (cuota) =>
      cuota.saldoPendiente > 0 &&
      cuota.fechaVencimiento >= now &&
      (cuota.estado === EstadoCuota.PENDIENTE ||
        cuota.estado === EstadoCuota.PARCIAL ||
        cuota.estado === EstadoCuota.REPROGRAMADA),
  );
}

export function buildRepactationPlan(
  saldoRepactado: number,
  cantidadCuotasNuevas: number,
  fechaPrimeraCuota: Date,
  maxNumeroActual: number,
) {
  return generateInstallmentPlan(
    saldoRepactado,
    cantidadCuotasNuevas,
    fechaPrimeraCuota,
  ).map((cuota, index) => ({
    ...cuota,
    numero_cuota: maxNumeroActual + index + 1,
  }));
}
