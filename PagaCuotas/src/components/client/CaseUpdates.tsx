import { useEffect, useState } from 'react';
import { Briefcase, Scale, ChevronDown, FileText, Clock, Users, AlertCircle, CheckCircle2, Loader2, Gavel } from 'lucide-react';
import { fetchCaseUpdates, formatDate, type CaseWithUpdates } from '../../lib/clientPortal';
import { cn } from '../../lib/utils';

const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Briefcase }> = {
  OPEN: { label: 'Recibido', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', icon: Clock },
  IN_PROGRESS: { label: 'En Curso', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', icon: Gavel },
  FINISHED: { label: 'Concluido', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', icon: CheckCircle2 },
  HALTED_BY_PAYMENT: { label: 'Suspendido', color: 'text-red-600', bg: 'bg-red-50 border-red-200', icon: AlertCircle },
  WAITING_CUOTAS: { label: 'Esperando Pago', color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', icon: Clock },
};

function getStageConfig(stage: string) {
  return STAGE_CONFIG[stage] || { label: stage, color: 'text-slate-600', bg: 'bg-slate-50 border-slate-200', icon: Briefcase };
}

interface CaseUpdatesProps {
  cases?: CaseWithUpdates[];
  isLoading?: boolean;
  error?: string;
}

export default function CaseUpdates({ cases: providedCases, isLoading: providedLoading, error: providedError }: CaseUpdatesProps) {
  const [internalCases, setInternalCases] = useState<CaseWithUpdates[]>([]);
  const [internalLoading, setInternalLoading] = useState(true);
  const [internalError, setInternalError] = useState('');
  const usesExternalData = providedCases !== undefined;
  const cases = providedCases ?? internalCases;
  const isLoading = usesExternalData ? Boolean(providedLoading) : internalLoading;
  const error = usesExternalData ? (providedError || '') : internalError;

  useEffect(() => {
    if (usesExternalData) return;

    let cancelled = false;
    setInternalLoading(true);
    fetchCaseUpdates()
      .then((data) => {
        if (cancelled) return;
        setInternalCases(data.cases || []);
      })
      .catch((err: any) => {
        if (cancelled) return;
        // Graceful degradation: if the endpoint is not available, just hide the section
        setInternalError(err.message || '');
      })
      .finally(() => {
        if (!cancelled) setInternalLoading(false);
      });
    return () => { cancelled = true; };
  }, [usesExternalData]);

  // Don't render the section if there's an error or no data
  if (!isLoading && (error || cases.length === 0)) return null;

  if (isLoading) {
    return (
      <section className="space-y-4">
        <div className="flex justify-between items-center px-1">
          <h2 className="font-headline-md text-base font-bold text-primary uppercase tracking-wider">
            Avance de tu Caso
          </h2>
        </div>
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border-subtle bg-white p-5 text-sm font-semibold text-on-surface-variant">
          <Loader2 className="h-5 w-5 animate-spin" />
          Consultando avances...
        </div>
      </section>
    );
  }

  const totalUpdates = cases.reduce((acc, c) => acc + c.total_updates, 0);

  return (
    <section className="space-y-4">
      <div className="flex justify-between items-center px-1">
        <h2 className="font-headline-md text-base font-bold text-primary uppercase tracking-wider flex items-center gap-2">
          <Scale className="w-5 h-5 text-secondary" />
          Avance de tu Caso
        </h2>
        <span className="text-secondary font-label-caps text-[12px] font-bold">
          {totalUpdates} actualización{totalUpdates !== 1 ? 'es' : ''}
        </span>
      </div>

      {cases.map((kase) => {
        const stageConfig = getStageConfig(kase.stage);
        const StageIcon = stageConfig.icon;

        return (
          <details
            key={kase.id}
            className="group bg-white border border-border-subtle rounded-xl overflow-hidden shadow-sm [&_summary::-webkit-details-marker]:hidden"
            open={cases.length === 1}
          >
            {/* Case Header */}
            <summary className="flex items-center justify-between p-4 cursor-pointer list-none hover:bg-slate-50/50 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="bg-primary-container/10 p-2.5 rounded-lg flex-shrink-0">
                  <Briefcase className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-body-base font-bold text-sm">{kase.code}</p>
                    <span className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border',
                      stageConfig.bg, stageConfig.color
                    )}>
                      <StageIcon className="w-3 h-3" />
                      {stageConfig.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {kase.categoria && (
                      <span className="font-body-sm text-on-surface-variant text-xs">
                        {kase.categoria}
                      </span>
                    )}
                    {kase.abogados.length > 0 && (
                      <span className="flex items-center gap-1 text-xs text-on-surface-variant">
                        <Users className="w-3 h-3" />
                        {kase.abogados[0].nombre.split(' ')[0]}
                        {kase.abogados.length > 1 && ` +${kase.abogados.length - 1}`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[11px] font-semibold text-on-surface-variant hidden sm:block">
                  {kase.total_updates} avance{kase.total_updates !== 1 ? 's' : ''}
                </span>
                <ChevronDown className="w-5 h-5 text-slate-400 transition-transform duration-200 group-open:rotate-180" />
              </div>
            </summary>

            {/* Updates Timeline */}
            <div className="border-t border-border-subtle bg-gradient-to-b from-slate-50/50 to-white">
              {kase.updates.length === 0 ? (
                <div className="px-5 py-6 text-center">
                  <Clock className="w-8 h-8 text-on-surface-variant/40 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-on-surface-variant">
                    Sin actualizaciones aún
                  </p>
                  <p className="text-xs text-on-surface-variant mt-1">
                    Tu equipo legal registrará los avances aquí.
                  </p>
                </div>
              ) : (
                <div className="px-5 py-4 space-y-0">
                  {kase.updates.map((update, idx) => (
                    <div key={update.id} className="relative flex gap-3">
                      {/* Timeline line */}
                      {idx < kase.updates.length - 1 && (
                        <div className="absolute left-[11px] top-6 bottom-0 w-px bg-border-subtle" />
                      )}
                      {/* Timeline dot */}
                      <div className="relative flex-shrink-0 mt-1.5">
                        <div className={cn(
                          'w-[22px] h-[22px] rounded-full flex items-center justify-center border-2',
                          idx === 0
                            ? 'bg-secondary border-secondary text-white'
                            : 'bg-white border-border-subtle text-on-surface-variant'
                        )}>
                          <FileText className="w-3 h-3" />
                        </div>
                      </div>
                      {/* Content */}
                      <div className={cn(
                        'flex-1 pb-4 min-w-0',
                        idx === 0 ? 'pt-0' : 'pt-0'
                      )}>
                        <div className="flex items-center gap-2 mb-1">
                          <time className={cn(
                            'text-[11px] font-bold uppercase tracking-wide',
                            idx === 0 ? 'text-secondary' : 'text-on-surface-variant'
                          )}>
                            {formatDate(update.created_at)}
                          </time>
                          {idx === 0 && (
                            <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-secondary/10 text-secondary border border-secondary/20">
                              Último
                            </span>
                          )}
                        </div>
                        <p className="text-sm leading-relaxed text-slate-700">
                          {update.description}
                        </p>
                        {update.document_url && (
                          <a
                            href={update.document_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 mt-1.5 text-xs font-bold text-secondary hover:underline"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Ver documento
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>
        );
      })}
    </section>
  );
}
