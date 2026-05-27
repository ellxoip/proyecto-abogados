"use client";

import { useState, useTransition } from "react";
import { verifySecondaryIdentity } from "@/app/portal/actions-security";

import { ShieldAlert, Lock, Key, ChevronRight } from "lucide-react";

type Props = {
  caseId: string;
  caseCode: string;
};

export function IdentityChallenge({ caseId, caseCode }: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (code.length < 4) return;

    startTransition(async () => {
      const res = await verifySecondaryIdentity(caseId, code);
      if (res.ok) {
        window.location.reload(); // Refresh to clear the challenge
      } else {
        setError(res.reason ?? "Error desconocido");

      }
    });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg)]/95 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-[var(--surface)] rounded-lg shadow-2xl overflow-hidden border border-[var(--border-glass)] animate-in zoom-in duration-300">
        <div className="bg-[#1e3a8a] p-8 text-center text-[var(--gold)] relative">
          <div className="absolute top-4 right-4 opacity-20">
            <ShieldAlert className="w-12 h-12" />
          </div>
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--surface)]/10 mb-4 border border-white/20">
            <Lock className="w-8 h-8 text-[var(--gold)]" />
          </div>
          <h2 className="text-2xl font-bold font-serif tracking-tight">Verificación de Identidad</h2>
          <p className="text-blue-100 text-sm mt-2 font-medium">Este caso contiene información sensible y protegida.</p>
        </div>

        <div className="p-8">
          <div className="mb-6 text-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] block mb-1">Accediendo a</span>
            <span className="text-lg font-bold text-[var(--text)] tracking-widest">{caseCode}</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 block">PIN de Seguridad Personal</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="••••"
                  className="w-full text-center text-2xl tracking-[0.5em] font-bold border-b-2 border-slate-200 py-3 outline-none focus:border-[#1e3a8a] transition-colors"
                  maxLength={6}
                  autoFocus
                  disabled={isPending}
                />
              </div>
              {error && <p className="text-red-600 text-xs mt-2 text-center font-medium animate-shake">{error}</p>}
            </div>

            <button
              type="submit"
              disabled={isPending || code.length < 4}
              className="w-full bg-[var(--bg)] text-white py-4 rounded-sm text-xs font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-[var(--bg-deep)] transition-all group disabled:opacity-50"
            >
              {isPending ? "Validando..." : "Acceder al Expediente"}
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Si no recuerda su PIN de seguridad, por favor contacte a su abogado asignado para verificar su identidad y restablecer el acceso.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
