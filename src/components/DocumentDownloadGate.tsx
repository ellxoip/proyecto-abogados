"use client";

import { useState, useTransition, useRef } from "react";
import { verifyDownloadAccess } from "@/app/portal/actions-security";
import { Download, Lock, X, Eye, EyeOff, Loader2, AlertTriangle } from "lucide-react";

type Props = {
  caseId: string;
  documentUrl: string;
  label?: string;
  alreadyUnlocked?: boolean;
};

export function DocumentDownloadGate({ caseId, documentUrl, label = "Descargar documento adjunto", alreadyUnlocked }: Props) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(alreadyUnlocked ?? false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function triggerDownload() {
    const a = document.createElement("a");
    a.href = documentUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function handleClick() {
    if (unlocked) {
      triggerDownload();
      return;
    }
    setOpen(true);
    setError(null);
    setPassword("");
    setTimeout(() => inputRef.current?.focus(), 80);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setError(null);
    startTransition(async () => {
      const res = await verifyDownloadAccess(caseId, password);
      if (res.ok) {
        setUnlocked(true);
        setOpen(false);
        triggerDownload();
      } else {
        setError(res.reason ?? "Error al verificar");
        setPassword("");
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-md text-[11px] font-bold uppercase tracking-widest transition-colors hover:bg-[rgba(201,168,76,0.1)]"
        style={{ color: "var(--gold)", border: "1px solid rgba(201,168,76,0.25)" }}
      >
        {unlocked ? <Download className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-[var(--surface)] rounded-lg border border-[var(--border-glass)] shadow-2xl animate-in zoom-in duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-glass)]">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[var(--gold)]" />
                <span className="text-sm font-bold text-[var(--text)]">Verificar identidad</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Ingresa la contraseña de tu cuenta para descargar este documento.
              </p>

              <div className="relative">
                <input
                  ref={inputRef}
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Contraseña"
                  className="w-full px-4 py-2.5 pr-10 text-sm border border-[var(--border-glass)] rounded-md bg-[var(--surface-2)] text-[var(--text)] outline-none focus:border-[var(--gold)] transition-colors"
                  disabled={isPending}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-[11px] text-red-400 font-bold">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isPending || !password}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md text-[11px] font-bold uppercase tracking-widest transition-all disabled:opacity-50"
                style={{ background: "var(--gold)", color: "#0A0A0A" }}
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {isPending ? "Verificando..." : "Confirmar y descargar"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
