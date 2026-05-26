// ============================================================
// SIS.CONTABLE Types
// ============================================================

export interface SisContableCliente {
  id: string;
  rut: string;
  nombre: string;
  email: string;
  telefono: string;
}

export interface SisContableResumen {
  total_deuda: number;
  total_vencido: number;
  total_por_vencer: number;
  contratos_activos: number;
  cuotas_totales: number;
  cuotas_pagadas: number;
  cuotas_pendientes: number;
  cuotas_vencidas: number;
}

export interface SisContableContrato {
  id: string;
  servicio: string;
  estado: string;
  total_cuotas: number;
  cuotas_pagadas: number;
  cuotas_pendientes: number;
  cuotas_vencidas: number;
  monto_pendiente: number;
  monto_vencido: number;
}

export interface SisContableDebtResponse {
  cliente: SisContableCliente;
  resumen: SisContableResumen;
  contratos: SisContableContrato[];
}

export interface SisContableRawDebtResponse {
  cliente?: Partial<SisContableCliente>;
  resumen?: Partial<SisContableResumen>;
  resumen_deuda?: {
    total_cuotas?: number;
    cuotas_pagadas?: number;
    cuotas_pendientes?: number;
    monto_pendiente?: number;
    monto_vencido?: number;
  };
  contratos?: Array<Partial<SisContableContrato> & { tipo_servicio?: string }>;
  contratos_activos?: Array<{ id: string | number; tipo_servicio?: string; estado?: string }>;
  total_cuotas?: number;
  cuotas_pagadas?: number;
  cuotas_pendientes?: number;
  monto_pendiente?: number;
  monto_vencido?: number;
}

export interface SisContableCuota {
  id: string;
  numero: number;
  monto: number;
  monto_pagado: number;
  saldo: number;
  fecha_vencimiento: string;
  estado: string; // PENDIENTE, VENCIDA, PAGADA, PAGO_EN_PROCESO, etc.
  pagable: boolean;
}

export interface SisContableInstallmentsResponse {
  contrato_id: string;
  cliente_id: string;
  servicio: string;
  estado_contrato: string;
  resumen: {
    total_cuotas: number;
    cuotas_pagadas: number;
    cuotas_pendientes: number;
    cuotas_vencidas: number;
    monto_total: number;
    monto_pagado: number;
    saldo_pendiente: number;
  };
  cuotas: SisContableCuota[];
}

export interface SisContableRawInstallmentsResponse {
  contrato_id?: string | number;
  cliente_id?: string | number;
  servicio?: string;
  estado_contrato?: string;
  resumen?: SisContableInstallmentsResponse['resumen'];
  cuotas?: Array<Partial<SisContableCuota> & {
    numero_cuota?: number;
    monto_actual?: number;
    saldo_pendiente?: number;
    puede_pagar?: boolean;
  }>;
}

// --- Payment Intent Validation ---

export interface PaymentIntentValidateRequest {
  external_attempt_id: string;
  cliente_id: string;
  contrato_id: string;
  cuota_ids: string[];
  monto_total: number;
}

export interface PaymentIntentValidateResponseApproved {
  valid: true;
  status: 'APPROVED_TO_PAY';
  external_attempt_id: string;
  cliente_id: string;
  contrato_id: string;
  cuota_ids: string[];
  monto_validado: number;
  expires_at: string;
}

export interface PaymentIntentValidateResponseRejected {
  valid: false;
  status: 'REJECTED';
  code: string;
  message: string;
  expected_amount?: number;
  received_amount?: number;
  invalid_cuotas?: string[];
}

export type PaymentIntentValidateResponse =
  | PaymentIntentValidateResponseApproved
  | PaymentIntentValidateResponseRejected;

// --- Payment Confirmed ---

export interface PaymentConfirmedPayload {
  external_payment_id: string;
  external_attempt_id: string;
  identifier: string;
  provider: string;
  cliente_id: string;
  contrato_id: string;
  cuota_ids: string[];
  monto_pagado: number;
  fecha_pago: string;
  comprobante_url?: string | null;
  metadata?: Record<string, any>;
}

export interface PaymentConfirmedResponse {
  ok: boolean;
  status: 'PAYMENT_REGISTERED' | 'ALREADY_REGISTERED';
  external_payment_id: string;
  pago_id: string;
  cuotas_actualizadas?: number;
  contrato?: {
    id: string;
    estado: string;
    saldo_pendiente: number;
    cuotas_pendientes: number;
  };
}

// --- Payment Rejected ---

export interface PaymentRejectedPayload {
  external_attempt_id: string;
  provider: string;
  cliente_id: string;
  contrato_id: string;
  cuota_ids: string[];
  monto_total: number;
  reason: string;
  provider_status: string;
  fecha_evento: string;
  metadata?: Record<string, any>;
}

export interface PaymentRejectedResponse {
  ok: boolean;
  status: 'PAYMENT_REJECTED_REGISTERED';
  external_attempt_id: string;
}

// --- Payment Reversed ---

export interface PaymentReversedPayload {
  external_reversal_id: string;
  external_payment_id: string;
  external_attempt_id: string;
  provider: string;
  cliente_id: string;
  contrato_id: string;
  cuota_ids: string[];
  monto_reversado: number;
  fecha_reversa: string;
  reason: string;
  metadata?: Record<string, any>;
}

export interface PaymentReversedResponse {
  ok: boolean;
  status: 'PAYMENT_REVERSED';
  external_reversal_id: string;
  external_payment_id: string;
  cuotas_actualizadas: number;
  contrato: {
    id: string;
    estado: string;
    saldo_pendiente: number;
    cuotas_pendientes: number;
  };
}

// --- Case Updates (from hive-service-control) ---

export interface CaseUpdateItem {
  id: string;
  description: string;
  document_url: string | null;
  created_at: string;
}

export interface CaseWithUpdates {
  id: string;
  code: string;
  stage: string;
  categoria: string | null;
  abogados: Array<{ id: string; nombre: string }>;
  created_at: string;
  updated_at: string;
  total_updates: number;
  updates: CaseUpdateItem[];
}

export interface CaseUpdatesResponse {
  success: boolean;
  identifier: string;
  cliente: { id: string; nombre: string; email: string } | null;
  cases: CaseWithUpdates[];
}

// ============================================================
// CRM Types
// ============================================================

export interface CrmAuthResponse {
  access_token: string;
  token_type: string;
}

export interface CrmLead {
  id: number;
  nombre: string;
  rut: string;
  email: string;
  telefono: string;
  etapa: string;
  grupo_id: number;
  area_id: number;
}

export interface CrmPaymentNotification {
  external_payment_id: string;
  cliente_rut: string;
  cliente_nombre: string;
  contrato_id: string;
  servicio: string;
  monto_pagado: number;
  fecha_pago: string;
  provider: string;
  method?: string;
  cuotas_pagadas: number;
}

// ============================================================
// Webhook / Provider Types
// ============================================================

export interface WebhookProviderPayload {
  external_attempt_id: string;
  provider_transaction_id: string;
  status: 'approved' | 'rejected' | 'failed' | 'error';
  amount: number;
  method?: string;
  authorization_code?: string;
  error_code?: string;
  error_message?: string;
}

export interface ReversalWebhookPayload {
  external_payment_id: string;
  provider_transaction_id: string;
  amount: number;
  reason: string;
  provider_reversal_code?: string;
}

// ============================================================
// API Request Types (from Frontend)
// ============================================================

export interface CreatePaymentIntentRequest {
  identifier: string;
  cliente_contable_id: string;
  contrato_contable_id: string;
  cuota_ids: string[];
  amount: number;
  provider: string;
}

// ============================================================
// Sync Status
// ============================================================

export type SyncStatus = 'pending' | 'synced' | 'failed';

export interface IntegrationError {
  message: string;
  status: number;
  details: any;
  code?: string;
}
