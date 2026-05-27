import type { LucideIcon } from "lucide-react";
import Link from "next/link";

interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
}

interface EmptyStateProps {
  /** Icon shown above the title — keep it monochrome and meaningful. */
  icon?: LucideIcon;
  /** Headline (1 short sentence). */
  title: string;
  /** Supporting copy (1-2 sentences). Tells the user *why* it's empty and what they can do. */
  description?: string;
  /** Optional action buttons (primary first). */
  actions?: EmptyStateAction[];
  /** Constrain max width — defaults to "lg". */
  size?: "sm" | "md" | "lg";
  /** Extra className for the wrapper. */
  className?: string;
}

const SIZE_PADDING = {
  sm: "px-6 py-8",
  md: "px-8 py-12",
  lg: "px-10 py-16",
} as const;

export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
  size = "lg",
  className = "",
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center text-center ${SIZE_PADDING[size]} ${className}`}
    >
      {Icon && (
        <div
          aria-hidden
          className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{
            background: "var(--surface-3)",
            border: "1px solid var(--card-border)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <Icon className="h-6 w-6" style={{ color: "var(--text-muted)" }} />
        </div>
      )}
      <h3 className="text-base font-semibold text-[var(--text)]">{title}</h3>
      {description && (
        <p className="mt-2 max-w-md text-sm leading-6 text-[var(--text-muted)]">{description}</p>
      )}
      {actions && actions.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {actions.map((a, i) => {
            const isPrimary = (a.variant ?? (i === 0 ? "primary" : "secondary")) === "primary";
            const cls = isPrimary ? "btn-primary" : "btn-secondary";
            if (a.href) {
              return (
                <Link key={a.label} href={a.href} className={cls}>
                  {a.label}
                </Link>
              );
            }
            return (
              <button key={a.label} type="button" onClick={a.onClick} className={cls}>
                {a.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
