import { AlertTriangle, Gavel, Wallet, Clock, ShieldAlert } from 'lucide-react';
import { formatCurrency, formatDate, type CaseWithUpdates, type SisContableCuota } from '../../lib/clientPortal';
import { cn } from '../../lib/utils';

type Tone = 'critical' | 'warning' | 'info';

interface BannerCopy {
  title: string;
  body: string;
  tone: Tone;
  icon: typeof AlertTriangle;
}

function pickCopy(stage: string, cuotasVencidas: number): BannerCopy {
  if (cuotasVencidas <= 0) {
    return {
      title: 'Tu caso avanza al ritmo de tus pagos',
      body: 'Mantén tus cuotas al día para que tu equipo legal pueda seguir gestionando sin interrupciones.',
      tone: 'info',
      icon: Gavel,
    };
  }

  switch (stage) {
    case 'HALTED_BY_PAYMENT':
      return {
        title: 'Tu caso está SUSPENDIDO por pago pendiente',
        body: 'Tu equipo legal detuvo las gestiones hasta regularizar tu cuenta. Paga ahora para reanudar de inmediato.',
        tone: 'critical',
        icon: ShieldAlert,
      };
    case 'WAITING_CUOTAS':
      return {
        title: 'Tu caso está esperando tu pago para continuar',
        body: 'El abogado a cargo no puede avanzar al siguiente hito sin tu cuota al día. Regulariza ahora para no perder tiempo procesal.',
        tone: 'critical',
        icon: AlertTriangle,
      };
    case 'IN_PROGRESS':
      return {
        title: 'Tu caso está en curso — no lo frenes',
        body: 'Tu equipo legal está trabajando activamente. Una cuota vencida puede pausar las gestiones. Paga hoy para mantener el ritmo.',
        tone: 'critical',
        icon: Gavel,
      };
    case 'OPEN':
      return {
        title: 'Tu caso ya fue recibido',
        body: 'Para iniciar las gestiones, necesitamos que regularices tu cuota vencida. Paga ahora y arrancamos.',
        tone: 'critical',
        icon: Clock,
      };
    case 'FINISHED':
      return {
        title: 'Tu caso fue concluido — quedan cuotas pendientes',
        body: 'Aunque el caso terminó, mantener tus pagos al día evita gestiones de cobranza.',
        tone: 'critical',
        icon: Wallet,
      };
    default:
      return {
        title: 'Tienes una cuota vencida',
        body: 'Regulariza tu cuota para que tu caso siga avanzando sin contratiempos.',
        tone: 'critical',
        icon: AlertTriangle,
      };
  }
}

const TONE_STYLES: Record<Tone, { container: string; iconWrap: string; title: string; body: string; cta: string }> = {
  critical: {
    container: 'border-red-300 bg-gradient-to-br from-red-50 to-red-100/60',
    iconWrap: 'bg-red-600 text-white',
    title: 'text-red-800',
    body: 'text-red-900/80',
    cta: 'bg-red-600 hover:bg-red-700 text-white',
  },
  warning: {
    container: 'border-amber-300 bg-gradient-to-br from-amber-50 to-orange-100/60',
    iconWrap: 'bg-amber-600 text-white',
    title: 'text-amber-900',
    body: 'text-amber-900/80',
    cta: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  info: {
    container: 'border-emerald-300 bg-gradient-to-br from-emerald-50 to-emerald-100/60',
    iconWrap: 'bg-emerald-600 text-white',
    title: 'text-emerald-900',
    body: 'text-emerald-900/80',
    cta: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
};

interface Props {
  cases: CaseWithUpdates[];
  cuotasVencidas: number;
  montoVencido: number;
  nextInstallment?: SisContableCuota;
  onPay: () => void;
  disabled?: boolean;
}

export default function CaseUrgencyBanner({ cases, cuotasVencidas, montoVencido, nextInstallment, onPay, disabled }: Props) {
  if (cases.length === 0 && cuotasVencidas <= 0) return null;

  const primaryCase = cases[0];
  const stage = primaryCase?.stage || '';
  const copy = pickCopy(stage, cuotasVencidas);
  const styles = TONE_STYLES[copy.tone];
  const Icon = copy.icon;
  const latestUpdate = primaryCase?.updates?.[0];

  return (
    <section className={cn('rounded-xl border-2 p-5 shadow-sm', styles.container)}>
      <div className="flex items-start gap-4">
        <div className={cn('flex-shrink-0 p-2.5 rounded-lg', styles.iconWrap)}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          <div>
            <h3 className={cn('font-headline-md text-base font-bold leading-tight', styles.title)}>
              {copy.title}
            </h3>
            <p className={cn('text-sm font-medium mt-1', styles.body)}>
              {copy.body}
            </p>
          </div>

          {primaryCase && (
            <div className="rounded-lg bg-white/70 border border-white px-3 py-2 text-xs space-y-1">
              <div className="flex justify-between gap-2 flex-wrap">
                <span className="font-bold text-slate-700">Caso {primaryCase.code}</span>
                {primaryCase.abogados[0] && (
                  <span className="text-slate-600">Abogado: {primaryCase.abogados[0].nombre}</span>
                )}
              </div>
              {latestUpdate && (
                <p className="text-slate-600 leading-relaxed line-clamp-2">
                  <span className="font-semibold">Último avance ({formatDate(latestUpdate.created_at)}):</span>{' '}
                  {latestUpdate.description}
                </p>
              )}
            </div>
          )}

          {cuotasVencidas > 0 && (
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div>
                <p className={cn('text-[11px] uppercase font-bold tracking-wide', styles.body)}>
                  {cuotasVencidas} cuota{cuotasVencidas !== 1 ? 's' : ''} vencida{cuotasVencidas !== 1 ? 's' : ''}
                </p>
                <p className={cn('font-numeric-data text-xl font-bold', styles.title)}>
                  {formatCurrency(montoVencido || nextInstallment?.saldo || nextInstallment?.monto || 0)}
                </p>
              </div>
              <button
                type="button"
                onClick={onPay}
                disabled={disabled || !nextInstallment}
                className={cn(
                  'px-4 py-2.5 rounded-lg font-bold text-sm flex items-center gap-2 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed shadow',
                  styles.cta
                )}
              >
                <Wallet className="w-4 h-4" />
                Pagar y reanudar caso
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
