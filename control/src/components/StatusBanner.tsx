import type { ReactNode } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type StatusTone = "success" | "error" | "warning" | "info";

interface StatusBannerProps {
  tone: StatusTone;
  /** Short headline (5-9 words). */
  title?: string;
  /** Body content. Single sentence or React node. */
  children: ReactNode;
  /** Optional inline action (e.g. retry, undo). */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** If provided, renders a dismiss "X" button that calls this handler. */
  onDismiss?: () => void;
  /** Sets role=alert (errors / warnings). Defaults to role=status for success/info. */
  assertive?: boolean;
  className?: string;
}

const TONE_STYLES: Record<StatusTone, { bg: string; border: string; color: string; icon: LucideIcon }> = {
  success: { bg: "var(--green-dim)", border: "var(--green-border)", color: "var(--green)", icon: CheckCircle2 },
  error: { bg: "var(--red-dim)", border: "var(--red-border)", color: "var(--red)", icon: AlertCircle },
  warning: { bg: "var(--amber-dim)", border: "var(--amber-border)", color: "var(--amber)", icon: AlertTriangle },
  info: { bg: "var(--blue-dim)", border: "var(--blue-border)", color: "var(--blue)", icon: Info },
};

export function StatusBanner({
  tone,
  title,
  children,
  action,
  onDismiss,
  assertive,
  className = "",
}: StatusBannerProps) {
  const styles = TONE_STYLES[tone];
  const Icon = styles.icon;
  const role = assertive ?? (tone === "error" || tone === "warning") ? "alert" : "status";

  return (
    <div
      role={role}
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${className}`}
      style={{ background: styles.bg, borderColor: styles.border, color: styles.color }}
    >
      <Icon aria-hidden className="mt-0.5 h-5 w-5 flex-shrink-0" />
      <div className="flex-1 min-w-0 text-sm leading-6">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? "mt-0.5 text-[var(--text-soft)]" : ""}>{children}</div>
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="flex-shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wider underline-offset-2 hover:underline"
          style={{ color: styles.color }}
        >
          {action.label}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar"
          className="flex-shrink-0 rounded-md p-1 text-current opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
