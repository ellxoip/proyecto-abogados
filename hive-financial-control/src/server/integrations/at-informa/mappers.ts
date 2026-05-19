import { EstadoContrato, EstadoCuota } from "@prisma/client";
import { AtInformaCuotaEstado } from "./schemas";

export function mapAtInformaCuotaEstado(
  estado: AtInformaCuotaEstado,
  currentState?: EstadoCuota,
): EstadoCuota {
  const frozenStates = new Set<EstadoCuota>([
    EstadoCuota.REEMPLAZADA,
    EstadoCuota.ANULADA,
    EstadoCuota.CONDONADA,
  ]);
  if (
    currentState &&
    frozenStates.has(currentState)
  ) {
    return currentState;
  }

  switch (estado) {
    case "PAID":
      return EstadoCuota.PAGADA;
    case "UNPAID":
      return EstadoCuota.PENDIENTE;
    case "OVERDUE":
      return EstadoCuota.VENCIDA;
    case "RESTORED":
      return EstadoCuota.PAGADA;
    default:
      return EstadoCuota.PENDIENTE;
  }
}

export function mapAtInformaContratoEstado(input: {
  saldoPendiente?: number | null;
  saldoVencido?: number | null;
}): EstadoContrato {
  const saldoPendiente = Number(input.saldoPendiente ?? 0);
  const saldoVencido = Number(input.saldoVencido ?? 0);

  if (saldoPendiente <= 0) {
    return EstadoContrato.PAGADO;
  }
  if (saldoVencido > 0) {
    return EstadoContrato.EN_MORA;
  }
  return EstadoContrato.ACTIVO;
}
