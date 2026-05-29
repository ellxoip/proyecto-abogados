export type AdminLanguage = 'es-CL' | 'en-US' | 'pt-BR';
export type AdminAccent = 'indigo' | 'emerald' | 'slate' | 'rose';

export interface AdminPreferences {
  language: AdminLanguage;
  accent: AdminAccent;
  density: 'comfortable' | 'compact';
  dateFormat: 'cl' | 'iso';
}

const STORAGE_KEY = 'pagacuotas.adminPreferences';

export const defaultAdminPreferences: AdminPreferences = {
  language: 'es-CL',
  accent: 'indigo',
  density: 'comfortable',
  dateFormat: 'cl',
};

export const accentThemes: Record<AdminAccent, { primary: string; secondary: string; label: string }> = {
  indigo: { primary: '#1a2b4c', secondary: '#4b41e1', label: 'PagaCuotas Indigo' },
  emerald: { primary: '#064e3b', secondary: '#059669', label: 'Finanzas Verde' },
  slate: { primary: '#111827', secondary: '#475569', label: 'Operativo Gris' },
  rose: { primary: '#881337', secondary: '#e11d48', label: 'Alertas Rosa' },
};

export const languageLabels: Record<AdminLanguage, string> = {
  'es-CL': 'Español Chile',
  'en-US': 'English',
  'pt-BR': 'Português',
};

export function getAdminPreferences(): AdminPreferences {
  if (typeof window === 'undefined') return defaultAdminPreferences;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultAdminPreferences;
  try {
    return { ...defaultAdminPreferences, ...JSON.parse(raw) };
  } catch {
    return defaultAdminPreferences;
  }
}

export function saveAdminPreferences(preferences: AdminPreferences) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  applyAdminPreferences(preferences);
}

export function applyAdminPreferences(preferences = getAdminPreferences()) {
  if (typeof document === 'undefined') return;
  const theme = accentThemes[preferences.accent] || accentThemes.indigo;
  const root = document.documentElement;
  root.style.setProperty('--color-primary', theme.primary);
  root.style.setProperty('--color-primary-container', theme.primary);
  root.style.setProperty('--color-secondary', theme.secondary);
  root.style.setProperty('--color-secondary-container', theme.secondary);
  root.lang = preferences.language;
  root.dataset.adminDensity = preferences.density;
}
