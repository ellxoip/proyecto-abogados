import { EstadoContrato, EstadoCuota } from "@prisma/client";

export type ExternalContractPayload = {
  external_id: string;
  rut: string;
  nombre: string;
  telefono?: string;
  email?: string;
  fecha_ingreso: string;
  tipo_servicio: string;
  ccto: number;
  pago_inicial: number;
  cantidad_cuotas: number;
  fecha_primera_cuota: string;
};

export type PaymentAllocation = {
  cuotaId: number;
  montoAplicado: number;
  saldoRestanteCuota: number;
  estadoCuota: EstadoCuota;
};

export type PaymentResult = {
  totalPagado: number;
  aplicado: PaymentAllocation[];
  abonoNoAplicado: number;
  estadoContrato: EstadoContrato;
};

export type InstallmentInput = {
  id: number;
  fechaVencimiento: Date;
  saldoPendiente: number;
  montoPagado: number;
};
