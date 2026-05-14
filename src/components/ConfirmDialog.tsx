"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Info, X } from "lucide-react";

type ConfirmTone = "default" | "danger" | "warning" | "info";

interface ConfirmDialogProps {
  /** Whether the dialog is currently open. */
  open: boolean;
  /** Heading shown at the top of the modal. */
  title: string;
  /** Main descriptive copy. Single paragraph or React node. */
  description: React.ReactNode;
  /** Optional bullet list of "what will happen" for important confirmations. */
  bullets?: string[];
  /** Optional value the user must type literally to enable the confirm button. */
  requireText?: string;
  /** Confirm button label. */
  confirmLabel?: string;
  /** Cancel button label. */
  cancelLabel?: string;
  /** Visual tone — drives color of icon and confirm button. */
  tone?: ConfirmTone;
  /** Called when the user accepts. May be async; while pending, buttons are disabled. */
  onConfirm: () => void | Promise<void>;
  /** Close handler (also bound to ESC / overlay click). */
  onClose: () => void;
  /** If true, hides the X close button and disables overlay-close while pending. */
  blocking?: boolean;
}

const TONE_STYLES: Record<ConfirmTone, { iconBg: string; iconColor: string; btnBg: string; btnHover: string; iconBorder: string }> = {
  default: {
    iconBg: "var(--gold-dim)",
    iconColor: "var(--gold-deep)",
    iconBorder: "var(--gold-border)",
    btnBg: "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
    btnHover: "linear-gradient(180deg, var(--sidebar-deep) 0%, #14122E 100%)",
  },
  info: {
    iconBg: "var(--blue-dim)",
    iconColor: "var(--blue)",
    iconBorder: "var(--blue-border)",
    btnBg: "var(--blue)",
    btnHover: "#1D4ED8",
  },
  warning: {
    iconBg: "var(--amber-dim)",
    iconColor: "var(--amber)",
    iconBorder: "var(--amber-border)",
    btnBg: "var(--amber)",
    btnHover: "#B45309",
  },
  danger: {
    iconBg: "var(--red-dim)",
    iconColor: "var(--red)",
    iconBorder: "var(--red-border)",
    btnBg: "var(--red)",
    btnHover: "#B91C1C",
  },
};

export function ConfirmDialog({
  open,
  title,
  description,
  bullets,
  requireText,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "default",
  onConfirm,
  onClose,
  blocking,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [typed, setTyped] = useState("");
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Reset on open/close
  useEffect(() => {
    if (!open) {
      setTyped("");
      setPending(false);
    } else {
      // Focus confirm action shortly after mount (keep keyboard flow intuitive).
      const t = setTimeout(() => confirmBtnRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !blocking && !pending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, pending, blocking]);

  if (!open) return null;

  const requirementMet = requireText ? typed.trim() === requireText.trim() : true;
  const styles = TONE_STYLES[tone];

  async function handleConfirm() {
    if (pending || !requirementMet) return;
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (blocking || pending) return;
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-in fade-in duration-150"
      style={{ background: "rgba(8, 9, 13, 0.55)", backdropFilter: "blur(2px)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        className="w-full max-w-md rounded-2xl bg-[var(--surface)] shadow-[var(--shadow-xl)] animate-in zoom-in-95 duration-150 overflow-hidden"
        style={{ border: "1px solid var(--card-border)" }}
      >
        <div className="px-6 pt-6 pb-5">
          <div className="flex items-start gap-4">
            <div
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border"
              style={{ background: styles.iconBg, borderColor: styles.iconBorder }}
              aria-hidden
            >
              {tone === "info" ? (
                <Info className="h-5 w-5" style={{ color: styles.iconColor }} />
              ) : (
                <AlertTriangle className="h-5 w-5" style={{ color: styles.iconColor }} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 id="confirm-title" className="text-base font-semibold leading-snug text-[var(--text)]">
                {title}
              </h2>
              <div id="confirm-desc" className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                {description}
              </div>

              {bullets && bullets.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-sm text-[var(--text-soft)]">
                  {bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span
                        aria-hidden
                        className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full"
                        style={{ background: styles.iconColor }}
                      />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}

              {requireText && (
                <div className="mt-4 space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Para confirmar, escribe <span className="font-mono text-[var(--text)]">{requireText}</span>
                  </label>
                  <input
                    type="text"
                    autoFocus
                    autoComplete="off"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    className="form-input"
                    placeholder={requireText}
                  />
                </div>
              )}
            </div>

            {!blocking && (
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                aria-label="Cerrar"
                className="flex-shrink-0 rounded-md p-1.5 text-[var(--text-dim)] transition-colors hover:bg-[var(--btn-ghost-hover)] hover:text-[var(--text)] disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div
          className="flex items-center justify-end gap-2 px-6 py-4"
          style={{ background: "var(--surface-2)", borderTop: "1px solid var(--card-border)" }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="btn-secondary"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={handleConfirm}
            disabled={pending || !requirementMet}
            className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-all disabled:opacity-55 disabled:cursor-not-allowed"
            style={{ background: styles.btnBg }}
            onMouseEnter={(e) => { if (!pending && requirementMet) e.currentTarget.style.background = styles.btnHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = styles.btnBg; }}
          >
            {pending ? (
              <>
                <span className="spinner" />
                Procesando…
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
