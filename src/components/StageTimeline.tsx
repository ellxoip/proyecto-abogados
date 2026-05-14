import { CaseStage } from "@/lib/db-enums";
import { getStageMessage } from "@/lib/case-health";
import { Inbox, Briefcase, CheckCircle2, Shield, Clock } from "lucide-react";

/**
 * Legal OS v3.0 - Result-Oriented Stage Timeline
 * 
 * Each stage shows "What this means for you" - focused on the benefit/destination
 * rather than technical status.
 */

const HAPPY_PATH: { stage: CaseStage; label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }[] = [

  { stage: CaseStage.OPEN,         label: "Procesando",     icon: Inbox },
  { stage: CaseStage.IN_PROGRESS,  label: "En Desarrollo",   icon: Briefcase },
  { stage: CaseStage.FINISHED,     label: "Resuelto",    icon: CheckCircle2 },
];

const ALT_STATES: Record<string, { label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; color: string }> = {

  HALTED_BY_PAYMENT: { label: "Protegiendo tu avance",      icon: Shield, color: "#F87171" },
  WAITING_CUOTAS:    { label: "Esperando aprobación", icon: Clock,    color: "#F59E0B" },
};

export function StageTimeline({ stage }: { stage: CaseStage }) {
  const message = getStageMessage(stage);
  const isAlt = stage === CaseStage.HALTED_BY_PAYMENT || stage === CaseStage.WAITING_CUOTAS;

  if (isAlt) {
    const cfg = ALT_STATES[stage];
    const Icon = cfg.icon;
    return (
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-md border"
        style={{ background: cfg.color + "10", borderColor: cfg.color + "40" }}
      >
        <Icon className="w-5 h-5 flex-shrink-0" style={{ color: cfg.color }} />
        <div>
          <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: cfg.color }}>
            {message.title}
          </div>
          <div className="text-sm font-medium" style={{ color: cfg.color }}>
            {message.description}
          </div>
        </div>
      </div>
    );
  }

  const currentIdx = HAPPY_PATH.findIndex((s) => s.stage === stage);

  return (
    <div className="flex items-center gap-2">
      {HAPPY_PATH.map(({ stage: s, label, icon: Icon }, i) => {
        const reached = currentIdx >= 0 && i <= currentIdx;
        const isCurrent = i === currentIdx;
        const color = reached ? "var(--gold)" : "var(--text-muted)";
        const bg = reached ? "rgba(156,255,0,0.12)" : "transparent";
        return (
          <div key={s} className="flex items-center gap-2">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-md border"
              style={{
                color,
                background: bg,
                borderColor: reached ? "var(--gold)40" : "var(--border-glass)",
                fontWeight: isCurrent ? 700 : 500,
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="text-[11px] uppercase tracking-widest">{label}</span>
            </div>
            {i < HAPPY_PATH.length - 1 && (
              <div className="w-6 h-[1px]" style={{ background: reached ? "var(--gold)40" : "var(--border-glass)" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
