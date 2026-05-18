import { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, Bell, CheckCircle, RefreshCw, ShieldAlert, Wallet } from 'lucide-react';
import { adminRequest } from '../../lib/adminApi';
import { formatCurrency } from '../../lib/clientPortal';

type WarningLevel = 'WARNING_10' | 'WARNING_20' | 'WARNING_30';

type MorosidadResponse = {
  ok: true;
  totals: {
    clients_with_active_warnings: number;
    saldo_vencido_total: number;
    cuotas_vencidas_total: number;
    by_level: Record<WarningLevel, number>;
  };
  clients: Array<{
    rut: string;
    cliente_nombre: string;
    max_level: WarningLevel | null;
    counts: Record<WarningLevel, number>;
    last_warning_at: string | null;
    cuotas_vencidas: number;
    saldo_vencido: number;
    crm_email: string | null;
    crm_telefono: string | null;
  }>;
};

const LEVEL_LABEL: Record<WarningLevel, string> = {
  WARNING_10: '10 días',
  WARNING_20: '20 días',
  WARNING_30: '30+ días — corte',
};

const LEVEL_COLOR: Record<WarningLevel, string> = {
  WARNING_10: 'bg-amber-100 text-amber-800 border-amber-300',
  WARNING_20: 'bg-orange-100 text-orange-800 border-orange-300',
  WARNING_30: 'bg-red-100 text-red-800 border-red-300',
};

type SummaryResponse = {
  ok: true;
  metrics: {
    confirmed_total: number;
    confirmed_count: number;
    attempts_count: number;
    pending_attempts: number;
    rejected_attempts: number;
    sis_contable_failed: number;
    crm_failed: number;
  };
  recent_logs: Array<{
    id: string;
    system: string;
    event_type: string;
    status: number | null;
    error_message: string | null;
    created_at: string;
  }>;
};

export default function Dashboard() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [morosidad, setMorosidad] = useState<MorosidadResponse | null>(null);
  const [morosidadError, setMorosidadError] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const loadSummary = async () => {
    setIsLoading(true);
    setErrorMessage('');
    setMorosidadError('');
    try {
      setSummary(await adminRequest<SummaryResponse>('/api/admin/summary'));
      setLastUpdatedAt(new Date());
    } catch (error: any) {
      setErrorMessage(error.message || 'No fue posible cargar el resumen administrativo.');
    } finally {
      setIsLoading(false);
    }

    // Warnings de morosidad: best-effort, no rompe el dashboard si financial está caído.
    try {
      setMorosidad(await adminRequest<MorosidadResponse>('/api/admin/morosidad-warnings'));
    } catch (error: any) {
      setMorosidadError(error.message || 'No se pudo consultar warnings en financial.');
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const metrics = summary?.metrics;

  return (
    <div className="p-6 md:p-10 w-full h-full overflow-y-auto bg-background-main">
      <div className="max-w-container-max-width mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="font-headline-md text-display-lg text-primary">Estado Financiero General</h2>
            <p className="font-body-base text-on-surface-variant">Datos reales desde intentos, pagos y logs de integracion.</p>
            {lastUpdatedAt && (
              <p className="mt-1 text-xs font-semibold text-slate-400">
                Ultima actualizacion: {lastUpdatedAt.toLocaleString('es-CL')}
              </p>
            )}
          </div>
          <button onClick={loadSummary} disabled={isLoading} className="flex items-center justify-center gap-2 px-6 py-3 bg-secondary text-on-primary rounded-xl font-bold transition-all hover:shadow-lg active:scale-95 disabled:opacity-70">
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>

        {errorMessage && (
          <div className="rounded-xl border border-error-red/30 bg-error-red/10 p-4 text-error-red font-semibold">
            {errorMessage}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl border border-border-subtle shadow-sm border-t-[3px] border-t-secondary">
            <div className="flex items-center justify-between mb-4">
              <span className="font-label-caps text-slate-500 uppercase">Total cobrado confirmado</span>
              <Wallet className="w-6 h-6 text-secondary" />
            </div>
            <span className="font-display-lg text-primary">{formatCurrency(metrics?.confirmed_total || 0)}</span>
            <p className="text-[10px] text-slate-400 mt-2 font-medium">{metrics?.confirmed_count || 0} pagos confirmados</p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-border-subtle shadow-sm border-t-[3px] border-t-success-green">
            <div className="flex items-center justify-between mb-4">
              <span className="font-label-caps text-slate-500 uppercase">Intentos de pago</span>
              <CheckCircle className="w-6 h-6 text-success-green" />
            </div>
            <span className="font-display-lg text-primary">{metrics?.attempts_count || 0}</span>
            <p className="text-[10px] text-slate-400 mt-2 font-medium">{metrics?.pending_attempts || 0} iniciados, {metrics?.rejected_attempts || 0} rechazados</p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-border-subtle shadow-sm border-t-[3px] border-t-error-red">
            <div className="flex items-center justify-between mb-4">
              <span className="font-label-caps text-slate-500 uppercase">Sincronizaciones fallidas</span>
              <AlertCircle className="w-6 h-6 text-error-red" />
            </div>
            <span className="font-display-lg text-primary">{(metrics?.sis_contable_failed || 0) + (metrics?.crm_failed || 0)}</span>
            <p className="text-[10px] text-slate-400 mt-2 font-medium">SIS.CONTABLE: {metrics?.sis_contable_failed || 0} / CRM: {metrics?.crm_failed || 0}</p>
          </div>
        </div>

        {/* ─── Warnings de Morosidad (10/20/30 días) — refleja CuotaWarning de financial ─── */}
        <section className="bg-white rounded-xl border border-border-subtle shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-error-red" />
              <h3 className="font-headline-md text-primary">Warnings de Morosidad</h3>
              <span className="text-xs text-slate-400">
                Fuente: hive-financial-control · ciclo 10 / 20 / 30 días
              </span>
            </div>
            {morosidadError && (
              <span className="text-xs font-semibold text-error-red">{morosidadError}</span>
            )}
          </div>

          {morosidad ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 border-b border-slate-100 bg-slate-50/40">
                <MorosidadStat
                  icon={Bell}
                  tone="amber"
                  label="W10 — Recordatorios"
                  value={String(morosidad.totals.by_level.WARNING_10)}
                />
                <MorosidadStat
                  icon={AlertTriangle}
                  tone="orange"
                  label="W20 — Aviso crítico"
                  value={String(morosidad.totals.by_level.WARNING_20)}
                />
                <MorosidadStat
                  icon={ShieldAlert}
                  tone="red"
                  label="W30 — Cortados"
                  value={String(morosidad.totals.by_level.WARNING_30)}
                />
                <MorosidadStat
                  icon={Wallet}
                  tone="slate"
                  label="Saldo vencido total"
                  value={formatCurrency(morosidad.totals.saldo_vencido_total)}
                  sub={`${morosidad.totals.cuotas_vencidas_total} cuotas vencidas`}
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50">
                    <tr>
                      <th className="px-6 py-3 font-label-caps text-slate-500 text-[10px]">Cliente</th>
                      <th className="px-6 py-3 font-label-caps text-slate-500 text-[10px]">RUT</th>
                      <th className="px-6 py-3 font-label-caps text-slate-500 text-[10px]">Nivel actual</th>
                      <th className="px-6 py-3 font-label-caps text-slate-500 text-[10px] text-right">Saldo vencido</th>
                      <th className="px-6 py-3 font-label-caps text-slate-500 text-[10px] text-center">Cuotas</th>
                      <th className="px-6 py-3 font-label-caps text-slate-500 text-[10px] text-center">Avisos (10/20/30)</th>
                      <th className="px-6 py-3 font-label-caps text-slate-500 text-[10px]">Último envío</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {morosidad.clients.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-8 text-center text-sm text-slate-500">
                          Sin clientes con warnings activos. Cartera al día.
                        </td>
                      </tr>
                    ) : (
                      morosidad.clients.map((c) => (
                        <tr key={c.rut}>
                          <td className="px-6 py-4 text-sm">
                            <div className="font-bold text-slate-800">{c.cliente_nombre}</div>
                            <div className="text-[11px] text-slate-400">
                              {c.crm_email ?? '—'} · {c.crm_telefono ?? '—'}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm font-mono text-slate-700">{c.rut}</td>
                          <td className="px-6 py-4 text-sm">
                            {c.max_level ? (
                              <span
                                className={`inline-flex px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${LEVEL_COLOR[c.max_level]}`}
                              >
                                {LEVEL_LABEL[c.max_level]}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-error-red text-right">
                            {formatCurrency(c.saldo_vencido)}
                          </td>
                          <td className="px-6 py-4 text-sm text-center">{c.cuotas_vencidas}</td>
                          <td className="px-6 py-4 text-sm text-center text-slate-600">
                            {c.counts.WARNING_10} / {c.counts.WARNING_20} / {c.counts.WARNING_30}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            {c.last_warning_at
                              ? new Date(c.last_warning_at).toLocaleString('es-CL')
                              : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-6 text-sm text-slate-500">
              {morosidadError ? morosidadError : 'Cargando warnings…'}
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-border-subtle shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h3 className="font-headline-md text-primary">Ultimos eventos de integracion</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50/50">
                <tr>
                  <th className="px-6 py-4 font-label-caps text-slate-500 text-[10px]">Sistema</th>
                  <th className="px-6 py-4 font-label-caps text-slate-500 text-[10px]">Evento</th>
                  <th className="px-6 py-4 font-label-caps text-slate-500 text-[10px]">Estado</th>
                  <th className="px-6 py-4 font-label-caps text-slate-500 text-[10px]">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(summary?.recent_logs || []).map((log) => (
                  <tr key={log.id}>
                    <td className="px-6 py-4 text-sm font-bold text-slate-800">{log.system}</td>
                    <td className="px-6 py-4 text-sm">{log.event_type}</td>
                    <td className="px-6 py-4 text-sm font-numeric-data">{log.status || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{log.error_message || '-'}</td>
                  </tr>
                ))}
                {!isLoading && (summary?.recent_logs.length || 0) === 0 && (
                  <tr>
                    <td className="px-6 py-8 text-center text-sm text-slate-500" colSpan={4}>Sin logs registrados todavia.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function MorosidadStat({
  icon: Icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: typeof Bell;
  tone: 'amber' | 'orange' | 'red' | 'slate';
  label: string;
  value: string;
  sub?: string;
}) {
  const styles = {
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
  }[tone];
  return (
    <div className={`rounded-lg border p-4 ${styles}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">{label}</span>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-[11px] mt-1 opacity-70">{sub}</div>}
    </div>
  );
}
