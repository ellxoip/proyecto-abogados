"use client";

import { useState, useId } from "react";
import { HelpCircle, Info } from "lucide-react";

type Variant = "icon" | "inline";
type Size = "sm" | "md";

interface HelpTipProps {
  /** Text shown inside the tooltip bubble. */
  content: string;
  /** Optional short label rendered next to the icon (variant="inline"). */
  label?: string;
  /** "icon" → just the icon · "inline" → icon + label inline */
  variant?: Variant;
  /** Tooltip placement relative to the trigger. */
  side?: "top" | "bottom" | "left" | "right";
  /** Size of the trigger icon. */
  size?: Size;
  /** Optional className for the wrapping element. */
  className?: string;
  /** Use Info icon instead of HelpCircle. */
  asInfo?: boolean;
}

/**
 * Lightweight help tooltip — pure CSS positioning, accessible (aria-describedby + focus/hover).
 * No external dependencies; respects light/dark theme via CSS tokens.
 */
export function HelpTip({
  content,
  label,
  variant = "icon",
  side = "top",
  size = "sm",
  className = "",
  asInfo = false,
}: HelpTipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const Icon = asInfo ? Info : HelpCircle;
  const iconSize = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";

  const positionClass = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  }[side];

  return (
    <span
      className={`relative inline-flex items-center gap-1.5 align-middle ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {variant === "inline" && label && (
        <span className="text-xs font-medium text-[var(--text)]">{label}</span>
      )}
      <button
        type="button"
        aria-label={label ? `Ayuda: ${label}` : "Ayuda"}
        aria-describedby={open ? id : undefined}
        className="inline-flex items-center justify-center rounded-full transition-colors text-[var(--text-dim)] hover:text-[var(--gold)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] cursor-help"
      >
        <Icon className={iconSize} />
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          className={`absolute z-50 w-64 px-3 py-2.5 rounded-lg text-[11px] leading-snug font-medium pointer-events-none ${positionClass}`}
          style={{
            background: "var(--text)",
            color: "var(--surface)",
            boxShadow: "var(--shadow-lg)",
            opacity: 0.97,
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
