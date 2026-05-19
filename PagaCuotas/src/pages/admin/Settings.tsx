import { useEffect, useState } from 'react';
import { Check, Database, Globe2, Languages, Palette, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { adminRequest } from '../../lib/adminApi';
import {
  accentThemes,
  applyAdminPreferences,
  defaultAdminPreferences,
  getAdminPreferences,
  languageLabels,
  saveAdminPreferences,
  type AdminAccent,
  type AdminLanguage,
  type AdminPreferences,
} from '../../lib/adminPreferences';

type ProvidersResponse = {
  ok: true;
  environment: string;
  providers: Array<{ name: string; environment: string; isDefault: boolean; status: string }>;
  health: Record<string, { healthy: boolean; message: string }>;
};

export default function Settings() {
  const [preferences, setPreferences] = useState<AdminPreferences>(getAdminPreferences);
  const [providers, setProviders] = useState<ProvidersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const updatePreference = <K extends keyof AdminPreferences>(key: K, value: AdminPreferences[K]) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    applyAdminPreferences(next);
    setSavedMessage('');
  };

  const loadProviders = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      setProviders(await adminRequest<ProvidersResponse>('/api/admin/providers'));
    } catch (error: any) {
      setErrorMessage(error.message || 'No fue posible cargar la configuracion de proveedores.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  const handleSave = () => {
    saveAdminPreferences(preferences);
    setSavedMessage('Configuracion guardada para este administrador.');
  };

  const handleReset = () => {
    setPreferences(defaultAdminPreferences);
    saveAdminPreferences(defaultAdminPreferences);
    setSavedMessage('Configuracion restaurada.');
  };

  return (
    <div className="p-6 md:p-10 w-full h-full overflow-y-auto bg-background-main">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-headline-md text-display-lg text-primary">Configuracion de PagaCuotas</h1>
            <p className="font-body-base text-on-surface-variant">Preferencias reales del portal administrativo y estado operativo de pagos.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={handleReset} className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-white px-4 py-3 text-sm font-bold text-primary hover:bg-slate-50">
              <RefreshCw className="h-4 w-4" />
              Restaurar
            </button>
            <button onClick={handleSave} className="inline-flex items-center gap-2 rounded-lg bg-secondary px-5 py-3 text-sm font-bold text-white shadow-sm hover:opacity-95">
              <Save className="h-4 w-4" />
              Guardar
            </button>
          </div>
        </header>

        {(savedMessage || errorMessage) && (
          <div className={`rounded-lg border px-4 py-3 text-sm font-semibold ${errorMessage ? 'border-error-red/30 bg-error-red/10 text-error-red' : 'border-success-green/30 bg-success-green/10 text-success-green'}`}>
            {errorMessage || savedMessage}
          </div>
        )}

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-xl border border-border-subtle bg-white shadow-sm">
            <div className="border-b border-border-subtle p-6">
              <div className="flex items-center gap-3">
                <Palette className="h-6 w-6 text-secondary" />
                <div>
                  <h2 className="font-headline-md text-xl text-primary">Apariencia</h2>
                  <p className="text-sm text-on-surface-variant">Color corporativo y densidad visual del panel.</p>
                </div>
              </div>
            </div>

            <div className="space-y-8 p-6">
              <div>
                <p className="mb-3 text-[11px] font-bold uppercase text-on-surface-variant">Color principal</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(Object.keys(accentThemes) as AdminAccent[]).map((accent) => {
                    const theme = accentThemes[accent];
                    const active = preferences.accent === accent;
                    return (
                      <button
                        key={accent}
                        type="button"
                        onClick={() => updatePreference('accent', accent)}
                        className={`flex items-center justify-between rounded-lg border p-4 text-left transition ${active ? 'border-secondary bg-secondary/5' : 'border-border-subtle hover:border-secondary/40'}`}
                      >
                        <span>
                          <span className="block text-sm font-bold text-primary">{theme.label}</span>
                          <span className="block text-xs text-on-surface-variant">{theme.primary} / {theme.secondary}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="h-6 w-6 rounded-full" style={{ background: theme.primary }} />
                          <span className="h-6 w-6 rounded-full" style={{ background: theme.secondary }} />
                          {active && <Check className="h-5 w-5 text-secondary" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-3 text-[11px] font-bold uppercase text-on-surface-variant">Densidad de informacion</p>
                <div className="inline-flex rounded-lg border border-border-subtle bg-slate-50 p-1">
                  {[
                    ['comfortable', 'Comoda'],
                    ['compact', 'Compacta'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => updatePreference('density', value as AdminPreferences['density'])}
                      className={`rounded-md px-4 py-2 text-sm font-bold ${preferences.density === value ? 'bg-white text-secondary shadow-sm' : 'text-slate-500'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border-subtle bg-white shadow-sm">
            <div className="border-b border-border-subtle p-6">
              <div className="flex items-center gap-3">
                <Languages className="h-6 w-6 text-secondary" />
                <div>
                  <h2 className="font-headline-md text-xl text-primary">Idioma y formato</h2>
                  <p className="text-sm text-on-surface-variant">Preferencias locales del administrador.</p>
                </div>
              </div>
            </div>

            <div className="space-y-6 p-6">
              <label className="block">
                <span className="mb-2 block text-[11px] font-bold uppercase text-on-surface-variant">Idioma</span>
                <select
                  value={preferences.language}
                  onChange={(event) => updatePreference('language', event.target.value as AdminLanguage)}
                  className="h-12 w-full rounded-lg border border-border-subtle bg-white px-3 text-sm font-semibold outline-none focus:border-secondary"
                >
                  {(Object.keys(languageLabels) as AdminLanguage[]).map((language) => (
                    <option key={language} value={language}>{languageLabels[language]}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-[11px] font-bold uppercase text-on-surface-variant">Formato de fecha</span>
                <select
                  value={preferences.dateFormat}
                  onChange={(event) => updatePreference('dateFormat', event.target.value as AdminPreferences['dateFormat'])}
                  className="h-12 w-full rounded-lg border border-border-subtle bg-white px-3 text-sm font-semibold outline-none focus:border-secondary"
                >
                  <option value="cl">Chile - DD/MM/AAAA</option>
                  <option value="iso">ISO - AAAA-MM-DD</option>
                </select>
              </label>

              <div className="rounded-lg bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-primary">
                  <Globe2 className="h-4 w-4 text-secondary" />
                  Vista previa
                </div>
                <p className="mt-2 text-sm text-on-surface-variant">
                  {preferences.language === 'en-US'
                    ? 'Financial dashboard configured for payment operations.'
                    : preferences.language === 'pt-BR'
                      ? 'Painel financeiro configurado para operacoes de pagamento.'
                      : 'Panel financiero configurado para operaciones de pago.'}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border-subtle bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-border-subtle p-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Database className="h-6 w-6 text-secondary" />
              <div>
                <h2 className="font-headline-md text-xl text-primary">Estado de configuracion operativa</h2>
                <p className="text-sm text-on-surface-variant">Lectura real de proveedores registrados en el backend.</p>
              </div>
            </div>
            <button onClick={loadProviders} disabled={isLoading} className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-white px-4 py-2 text-sm font-bold text-primary hover:bg-slate-50 disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Verificar
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-3">
            {(providers?.providers || []).map((provider) => {
              const health = providers?.health?.[provider.name];
              return (
                <div key={provider.name} className="rounded-lg border border-border-subtle p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-black uppercase text-primary">{provider.name}</h3>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${health?.healthy ? 'bg-success-green/10 text-success-green' : 'bg-error-red/10 text-error-red'}`}>
                      {health?.healthy ? 'Activo' : 'Revision'}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-on-surface-variant">Modo: {provider.environment}</p>
                  <p className="mt-2 text-xs text-slate-500">{health?.message || 'Sin respuesta de healthcheck.'}</p>
                  {provider.isDefault && (
                    <div className="mt-3 inline-flex items-center gap-1 rounded-md bg-secondary/10 px-2 py-1 text-[10px] font-bold text-secondary">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Predeterminado
                    </div>
                  )}
                </div>
              );
            })}
            {!providers && !isLoading && (
              <div className="rounded-lg border border-border-subtle p-4 text-sm text-on-surface-variant">No hay datos de proveedores cargados.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
