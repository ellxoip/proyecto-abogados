import { getApiBaseUrl } from './env';

export interface SisContableCliente {
  id: string;
  rut: string;
  nombre: string;
  email: string;
  telefono: string;
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
  resumen: {
    total_deuda: number;
    total_vencido: number;
    total_por_vencer: number;
    contratos_activos: number;
    cuotas_totales: number;
    cuotas_pagadas: number;
    cuotas_pendientes: number;
    cuotas_vencidas: number;
  };
  contratos: SisContableContrato[];
}

export interface SisContableCuota {
  id: string;
  numero: number;
  monto: number;
  monto_pagado: number;
  saldo: number;
  fecha_vencimiento: string;
  estado: string;
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

export interface ClientPortalSession {
  identifier: string;
  debts: SisContableDebtResponse;
  selectedContractId?: string;
}

export interface SelectedPaymentSession {
  identifier: string;
  cliente_contable_id: string;
  contrato_contable_id: string;
  cuota_ids: string[];
  amount: number;
  description: string;
  installmentNumber: number;
  totalInstallments: number;
}

export interface BillingDocumentSummary {
  id: string;
  external_billing_id?: string | null;
  document_type: string;
  sii_type: string;
  folio?: string | null;
  status: string;
  total_amount: number | string;
  pdf_url?: string | null;
  xml_url?: string | null;
  issued_at?: string | null;
  accepted_at?: string | null;
  created_at: string;
}

const API_BASE_URL = getApiBaseUrl();
const CLIENT_SESSION_KEY = 'pagacuotas.clientSession';
const CLIENT_TOKEN_KEY = 'pagacuotas.clientToken';
const SELECTED_PAYMENT_KEY = 'pagacuotas.selectedPayment';

export function getClientToken() {
  return window.sessionStorage.getItem(CLIENT_TOKEN_KEY);
}

export function saveClientToken(token: string) {
  window.sessionStorage.setItem(CLIENT_TOKEN_KEY, token);
}

export function clearClientToken() {
  window.sessionStorage.removeItem(CLIENT_TOKEN_KEY);
}

function clientAuthHeaders(): HeadersInit {
  const token = getClientToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', ...clientAuthHeaders() },
  });
  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    clearClientToken();
    window.sessionStorage.removeItem(CLIENT_SESSION_KEY);
    throw new Error(data.message || 'Sesion expirada. Inicia sesion nuevamente.');
  }

  if (!response.ok) {
    throw new Error(data.message || data.error || 'No se pudo obtener la informacion solicitada.');
  }

  return data as T;
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateValue: string) {
  if (!dateValue) return 'Sin fecha';

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';

  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function daysUntil(dateValue: string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

export function saveClientSession(session: ClientPortalSession) {
  window.sessionStorage.setItem(CLIENT_SESSION_KEY, JSON.stringify(session));
}

export function getClientSession(): ClientPortalSession | null {
  const rawSession = window.sessionStorage.getItem(CLIENT_SESSION_KEY);
  if (!rawSession) return null;

  try {
    return JSON.parse(rawSession) as ClientPortalSession;
  } catch {
    window.sessionStorage.removeItem(CLIENT_SESSION_KEY);
    return null;
  }
}

export function saveSelectedPayment(payment: SelectedPaymentSession) {
  window.sessionStorage.setItem(SELECTED_PAYMENT_KEY, JSON.stringify(payment));
}

export function getSelectedPayment(): SelectedPaymentSession | null {
  const rawPayment = window.sessionStorage.getItem(SELECTED_PAYMENT_KEY);
  if (!rawPayment) return null;

  try {
    return JSON.parse(rawPayment) as SelectedPaymentSession;
  } catch {
    window.sessionStorage.removeItem(SELECTED_PAYMENT_KEY);
    return null;
  }
}

export async function clientLogin(identifier: string, password: string): Promise<{ ok: true; token: string; cliente: SisContableCliente; debts: SisContableDebtResponse }> {
  const response = await fetch(`${API_BASE_URL}/api/client/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || 'No fue posible validar las credenciales.');
  }
  saveClientToken(data.token);
  return data;
}

export async function updateClientPassword(payload: { identifier: string; currentPassword: string; newPassword: string }) {
  const response = await fetch(`${API_BASE_URL}/api/client/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...clientAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || 'No fue posible actualizar la clave.');
  }
  return data as { ok: true };
}

export async function fetchClientDebts(identifier: string) {
  return requestJson<SisContableDebtResponse>(`${API_BASE_URL}/api/deudas/${encodeURIComponent(identifier)}`);
}

export async function fetchContractInstallments(contractId: string) {
  return requestJson<SisContableInstallmentsResponse>(`${API_BASE_URL}/api/contratos/${encodeURIComponent(contractId)}/cuotas`);
}

export async function fetchBillingDocuments() {
  return requestJson<{ ok: true; documents: BillingDocumentSummary[] }>(`${API_BASE_URL}/api/client/billing-documents`);
}

export function createPaymentIntent(payload: {
  identifier: string;
  cliente_contable_id: string;
  contrato_contable_id: string;
  cuota_ids: string[];
  amount: number;
  provider: string;
}) {
  return fetch(`${API_BASE_URL}/api/payment-intents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...clientAuthHeaders() },
    body: JSON.stringify(payload),
  });
}

export function createSupportTicket(payload: {
  requester_identifier: string;
  requester_name?: string;
  requester_email?: string;
  requester_phone?: string;
  subject: string;
  category: string;
  priority: string;
  message: string;
  source?: string;
}) {
  return fetch(`${API_BASE_URL}/api/support/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
