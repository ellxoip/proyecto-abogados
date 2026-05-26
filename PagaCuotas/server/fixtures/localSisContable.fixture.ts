import type {
  PaymentConfirmedPayload,
  PaymentConfirmedResponse,
  PaymentIntentValidateRequest,
  PaymentIntentValidateResponse,
  PaymentRejectedPayload,
  PaymentRejectedResponse,
  PaymentReversedPayload,
  PaymentReversedResponse,
  SisContableDebtResponse,
  SisContableInstallmentsResponse,
} from '../types/index.js';

const CLIENT_ID = 'cli_16798821_0';
const CONTRACT_ID = 'cont_credito_personal_16798821_0';
const CLIENT_IDENTIFIERS = new Set([
  '16798821-0',
  '167988210-0',
  '167988210',
  '16.798.821-0',
]);

const normalizeIdentifier = (identifier: string) => identifier.trim().toLowerCase().replace(/\s/g, '');

export const localDebt: SisContableDebtResponse = {
  cliente: {
    id: CLIENT_ID,
    rut: '16.798.821-0',
    nombre: 'Carlos Munoz',
    email: 'cliente@pagacuotas.cl',
    telefono: '+56 9 6798 8210',
  },
  resumen: {
    total_deuda: 136500,
    total_vencido: 45500,
    total_por_vencer: 91000,
    contratos_activos: 1,
    cuotas_totales: 5,
    cuotas_pagadas: 2,
    cuotas_pendientes: 3,
    cuotas_vencidas: 1,
  },
  contratos: [
    {
      id: CONTRACT_ID,
      servicio: 'Credito Personal',
      estado: 'ACTIVO',
      total_cuotas: 5,
      cuotas_pagadas: 2,
      cuotas_pendientes: 3,
      cuotas_vencidas: 1,
      monto_pendiente: 136500,
      monto_vencido: 45500,
    },
  ],
};

export const localInstallments: SisContableInstallmentsResponse = {
  contrato_id: CONTRACT_ID,
  cliente_id: CLIENT_ID,
  servicio: 'Credito Personal',
  estado_contrato: 'ACTIVO',
  resumen: {
    total_cuotas: 5,
    cuotas_pagadas: 2,
    cuotas_pendientes: 3,
    cuotas_vencidas: 1,
    monto_total: 227500,
    monto_pagado: 91000,
    saldo_pendiente: 136500,
  },
  cuotas: [
    {
      id: 'cuota_16798821_001',
      numero: 1,
      monto: 45500,
      monto_pagado: 45500,
      saldo: 0,
      fecha_vencimiento: '2026-03-15',
      estado: 'PAGADA',
      pagable: false,
    },
    {
      id: 'cuota_16798821_002',
      numero: 2,
      monto: 45500,
      monto_pagado: 45500,
      saldo: 0,
      fecha_vencimiento: '2026-04-15',
      estado: 'PAGADA',
      pagable: false,
    },
    {
      id: 'cuota_16798821_003',
      numero: 3,
      monto: 45500,
      monto_pagado: 0,
      saldo: 45500,
      fecha_vencimiento: '2026-05-15',
      estado: 'VENCIDA',
      pagable: true,
    },
    {
      id: 'cuota_16798821_004',
      numero: 4,
      monto: 45500,
      monto_pagado: 0,
      saldo: 45500,
      fecha_vencimiento: '2026-06-15',
      estado: 'PENDIENTE',
      pagable: true,
    },
    {
      id: 'cuota_16798821_005',
      numero: 5,
      monto: 45500,
      monto_pagado: 0,
      saldo: 45500,
      fecha_vencimiento: '2026-07-15',
      estado: 'PENDIENTE',
      pagable: false,
    },
  ],
};

export function findLocalDebt(identifier: string) {
  return CLIENT_IDENTIFIERS.has(normalizeIdentifier(identifier)) ? localDebt : null;
}

export function findLocalInstallments(contractId: string) {
  return contractId === CONTRACT_ID ? localInstallments : null;
}

export function validateLocalPaymentIntent(payload: PaymentIntentValidateRequest): PaymentIntentValidateResponse | null {
  if (payload.cliente_id !== CLIENT_ID || payload.contrato_id !== CONTRACT_ID) return null;

  const validCuotas = localInstallments.cuotas.filter((cuota) => cuota.pagable).map((cuota) => cuota.id);
  const invalidCuotas = payload.cuota_ids.filter((cuotaId) => !validCuotas.includes(cuotaId));
  const expectedAmount = payload.cuota_ids.reduce((sum, cuotaId) => {
    const cuota = localInstallments.cuotas.find((item) => item.id === cuotaId);
    return sum + (cuota?.saldo || 0);
  }, 0);

  if (invalidCuotas.length > 0 || expectedAmount !== payload.monto_total) {
    return {
      valid: false,
      status: 'REJECTED',
      code: 'LOCAL_VALIDATION_FAILED',
      message: 'La cuota seleccionada no esta disponible o el monto no coincide.',
      expected_amount: expectedAmount,
      received_amount: payload.monto_total,
      invalid_cuotas: invalidCuotas,
    };
  }

  return {
    valid: true,
    status: 'APPROVED_TO_PAY',
    external_attempt_id: payload.external_attempt_id,
    cliente_id: payload.cliente_id,
    contrato_id: payload.contrato_id,
    cuota_ids: payload.cuota_ids,
    monto_validado: payload.monto_total,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
}

export function confirmLocalPayment(payload: PaymentConfirmedPayload): PaymentConfirmedResponse | null {
  if (payload.cliente_id !== CLIENT_ID || payload.contrato_id !== CONTRACT_ID) return null;

  return {
    ok: true,
    status: 'PAYMENT_REGISTERED',
    external_payment_id: payload.external_payment_id,
    pago_id: `local_${payload.external_payment_id}`,
    cuotas_actualizadas: payload.cuota_ids.length,
    contrato: {
      id: CONTRACT_ID,
      estado: 'ACTIVO',
      saldo_pendiente: Math.max(localInstallments.resumen.saldo_pendiente - payload.monto_pagado, 0),
      cuotas_pendientes: Math.max(localInstallments.resumen.cuotas_pendientes - payload.cuota_ids.length, 0),
    },
  };
}

export function rejectLocalPayment(payload: PaymentRejectedPayload): PaymentRejectedResponse | null {
  if (payload.cliente_id !== CLIENT_ID || payload.contrato_id !== CONTRACT_ID) return null;
  return { ok: true, status: 'PAYMENT_REJECTED_REGISTERED', external_attempt_id: payload.external_attempt_id };
}

export function reverseLocalPayment(payload: PaymentReversedPayload): PaymentReversedResponse | null {
  if (payload.cliente_id !== CLIENT_ID || payload.contrato_id !== CONTRACT_ID) return null;

  return {
    ok: true,
    status: 'PAYMENT_REVERSED',
    external_reversal_id: payload.external_reversal_id,
    external_payment_id: payload.external_payment_id,
    cuotas_actualizadas: payload.cuota_ids.length,
    contrato: {
      id: CONTRACT_ID,
      estado: 'ACTIVO',
      saldo_pendiente: localInstallments.resumen.saldo_pendiente + payload.monto_reversado,
      cuotas_pendientes: localInstallments.resumen.cuotas_pendientes + payload.cuota_ids.length,
    },
  };
}
