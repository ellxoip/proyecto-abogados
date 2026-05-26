import { getApiBaseUrl } from './env';

const API_BASE_URL = getApiBaseUrl();
const ADMIN_TOKEN_KEY = 'pagacuotas.adminToken';

export function saveAdminToken(token: string) {
  window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function saveAdminEmail(email: string) {
  window.sessionStorage.setItem('pagacuotas.adminEmail', email);
}

export function getAdminToken() {
  return window.sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

export function clearAdminToken() {
  window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  window.sessionStorage.removeItem('pagacuotas.adminEmail');
}

export async function adminLogin(email: string, password: string) {
  const response = await fetch(`${API_BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.message || 'No fue posible iniciar sesion.');
  saveAdminToken(data.token);
  saveAdminEmail(data.email || email);
  return data;
}

export async function adminRequest<T>(path: string): Promise<T> {
  const token = getAdminToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (response.status === 401 || response.status === 403) {
    clearAdminToken();
    throw new Error('Sesion administrativa expirada.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || 'Sesion administrativa no valida.');
  return data as T;
}

export async function adminPatch<T>(path: string, payload: unknown): Promise<T> {
  const token = getAdminToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || 'No fue posible guardar los cambios.');
  return data as T;
}

export async function verifyAdminSession(): Promise<boolean> {
  const token = getAdminToken();
  if (!token) return false;
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/summary`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    if (response.ok) return true;
    if (response.status === 401 || response.status === 403) clearAdminToken();
    return false;
  } catch {
    return false;
  }
}
