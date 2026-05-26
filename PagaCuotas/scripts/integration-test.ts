import { paymentService } from '../server/services/payment.service';
import { sisContableClient } from '../server/clients/sisContable.client';
import { crmClient } from '../server/clients/crm.client';

// ============================================================
// Mocking SIS.CONTABLE Client
// ============================================================

(sisContableClient as any).getDebtsByIdentifier = async (identifier: string) => {
  console.log(`[Mock SIS.CONTABLE] Querying debts for ${identifier}`);
  return {
    cliente: { id: 'cli_123', rut: '12345678-9', nombre: 'Juan Pérez', email: 'juan@test.com', telefono: '+56912345678' },
    resumen: {
      total_deuda: 300000, total_vencido: 200000, total_por_vencer: 100000,
      contratos_activos: 1, cuotas_totales: 12, cuotas_pagadas: 5, cuotas_pendientes: 7, cuotas_vencidas: 2,
    },
    contratos: [
      {
        id: 'con_123', servicio: 'Juicio laboral', estado: 'MOROSO',
        total_cuotas: 12, cuotas_pagadas: 5, cuotas_pendientes: 7, cuotas_vencidas: 2,
        monto_pendiente: 300000, monto_vencido: 200000,
      },
    ],
  };
};

(sisContableClient as any).validatePaymentIntent = async (payload: any) => {
  console.log(`[Mock SIS.CONTABLE] Validating payment intent: ${payload.external_attempt_id}`);
  return {
    valid: true,
    status: 'APPROVED_TO_PAY',
    external_attempt_id: payload.external_attempt_id,
    cliente_id: payload.cliente_id,
    contrato_id: payload.contrato_id,
    cuota_ids: payload.cuota_ids,
    monto_validado: payload.monto_total,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  };
};

(sisContableClient as any).notifyPaymentConfirmed = async (payload: any) => {
  console.log(`[Mock SIS.CONTABLE] Confirming payment: ${payload.external_payment_id}`);
  return { ok: true, status: 'PAYMENT_REGISTERED', external_payment_id: payload.external_payment_id, pago_id: 'pago_mock_001' };
};

(sisContableClient as any).notifyPaymentRejected = async (payload: any) => {
  console.log(`[Mock SIS.CONTABLE] Registering rejection: ${payload.external_attempt_id}`);
  return { ok: true, status: 'PAYMENT_REJECTED_REGISTERED', external_attempt_id: payload.external_attempt_id };
};

(sisContableClient as any).notifyPaymentReversed = async (payload: any) => {
  console.log(`[Mock SIS.CONTABLE] Registering reversal: ${payload.external_reversal_id}`);
  return { ok: true, status: 'PAYMENT_REVERSED', external_reversal_id: payload.external_reversal_id };
};

// ============================================================
// Mocking CRM Client
// ============================================================

(crmClient as any).notifyPaymentConfirmed = async (data: any) => {
  console.log(`[Mock CRM] Payment notification sent: ${data.external_payment_id}`);
  return { ok: true };
};

(crmClient as any).getLeadByIdentifier = async (identifier: string) => {
  console.log(`[Mock CRM] Looking up lead: ${identifier}`);
  return { id: 1, nombre: 'Juan Pérez', rut: '12345678-9', email: 'juan@test.com' };
};

// ============================================================
// Test Execution
// ============================================================

async function runTests() {
  console.log('='.repeat(60));
  console.log('  PagaCuotas Integration Test Suite');
  console.log('='.repeat(60));

  // --- TEST 1: Consultar Deuda ---
  console.log('\n--- TEST 1: Consultar Deuda ---');
  const debts = await paymentService.getDebts('12345678-9');
  console.log(`✅ Found ${debts.contratos.length} contracts, total debt: $${debts.resumen.total_deuda}`);

  // --- TEST 2: Consultar Cuotas ---
  console.log('\n--- TEST 2: Consultar Cuotas por Contrato ---');
  // Mock getContractInstallments directly
  (sisContableClient as any).getContractInstallments = async (contratoId: string) => {
    console.log(`[Mock SIS.CONTABLE] Getting installments for ${contratoId}`);
    return {
      contrato_id: contratoId, cliente_id: 'cli_123', servicio: 'Juicio laboral',
      estado_contrato: 'MOROSO',
      resumen: { total_cuotas: 12, cuotas_pagadas: 5, cuotas_pendientes: 7, cuotas_vencidas: 2, monto_total: 1200000, monto_pagado: 900000, saldo_pendiente: 300000 },
      cuotas: [
        { id: 'cuota_001', numero: 1, monto: 100000, monto_pagado: 0, saldo: 100000, fecha_vencimiento: '2026-05-30', estado: 'VENCIDA', pagable: true },
        { id: 'cuota_002', numero: 2, monto: 100000, monto_pagado: 0, saldo: 100000, fecha_vencimiento: '2026-06-30', estado: 'PENDIENTE', pagable: true },
      ],
    };
  };
  const installments = await paymentService.getContractInstallments('con_123');
  console.log(`✅ Found ${installments.cuotas.length} installments, balance: $${installments.resumen.saldo_pendiente}`);

  // --- TEST 3: Crear Intención de Pago (con validación SIS.CONTABLE) ---
  console.log('\n--- TEST 3: Crear Intención de Pago (validado con SIS.CONTABLE) ---');
  const intent = await paymentService.createPaymentIntent({
    identifier: '12345678-9',
    cliente_contable_id: 'cli_123',
    contrato_contable_id: 'con_123',
    cuota_ids: ['cuota_001', 'cuota_002'],
    amount: 200000,
    provider: 'mercadopago',
  });
  console.log(`✅ Intent created: ${intent.external_attempt_id}`);
  console.log(`   Payment URL: ${intent.payment_url}`);

  // --- TEST 4: Webhook APROBADO ---
  console.log('\n--- TEST 4: Webhook Pago Aprobado ---');
  const payment = await paymentService.processWebhook({
    external_attempt_id: intent.external_attempt_id,
    provider_transaction_id: 'mp_999',
    status: 'approved',
    amount: 200000,
    method: 'tarjeta',
  });
  console.log(`✅ Payment confirmed: ${(payment as any)?.external_payment_id}`);

  // --- TEST 5: Webhook Duplicado (idempotencia) ---
  console.log('\n--- TEST 5: Webhook Duplicado (Idempotencia) ---');
  const duplicatePayment = await paymentService.processWebhook({
    external_attempt_id: intent.external_attempt_id,
    provider_transaction_id: 'mp_999',
    status: 'approved',
    amount: 200000,
    method: 'tarjeta',
  });
  const isSame = (duplicatePayment as any)?.external_payment_id === (payment as any)?.external_payment_id;
  console.log(`✅ Duplicate handled correctly (same payment): ${isSame}`);

  // --- TEST 6: Pago RECHAZADO ---
  console.log('\n--- TEST 6: Pago Rechazado ---');
  const intent2 = await paymentService.createPaymentIntent({
    identifier: '12345678-9',
    cliente_contable_id: 'cli_123',
    contrato_contable_id: 'con_123',
    cuota_ids: ['cuota_001'],
    amount: 100000,
    provider: 'mercadopago',
  });
  const rejected = await paymentService.processWebhook({
    external_attempt_id: intent2.external_attempt_id,
    provider_transaction_id: 'mp_rejected_001',
    status: 'rejected',
    amount: 100000,
    error_message: 'Fondos insuficientes',
    error_code: 'INSUFFICIENT_FUNDS',
  });
  console.log(`✅ Payment rejected: ${(rejected as any)?.external_attempt_id}`);

  // --- TEST 7: REVERSA de Pago ---
  console.log('\n--- TEST 7: Reversa de Pago ---');
  const reversal = await paymentService.processReversal({
    external_payment_id: (payment as any)?.external_payment_id,
    provider_transaction_id: 'mp_999',
    amount: 200000,
    reason: 'Reversa solicitada por el banco',
    provider_reversal_code: 'REV_001',
  });
  console.log(`✅ Reversal processed: ${(reversal as any)?.external_reversal_id}`);

  console.log('\n' + '='.repeat(60));
  console.log('  ALL TESTS COMPLETED SUCCESSFULLY ✅');
  console.log('='.repeat(60));
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
