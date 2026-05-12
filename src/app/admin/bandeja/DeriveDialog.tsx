"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deriveCasesToJefeMesa, assignCasesToAbogados } from "./actions";
import { useSession } from "next-auth/react";
import { Check } from "lucide-react";

type Member = { id: string; fullName: string };
type Props = {
  caseId: string;
  caseCode: string;
  jefes: Member[];
  abogados: Member[];
  isLocked?: boolean;
};

export function DeriveDialog({ caseId, caseCode, jefes, abogados, isLocked }: Props) {
  const router = useRouter();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const role = session?.user?.role;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"jefe" | "abogado">(role === "SUPER_ADMIN" ? "jefe" : "abogado");
  const [selectedJefe, setSelectedJefe] = useState("");
  const [selectedLawyers, setSelectedLawyers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Filtrar para que un Jefe de Mesa no pueda auto-asignarse como responsable
  const filteredJefes = jefes.filter(j => j.id !== currentUserId);

  function toggleLawyer(id: string) {
    setSelectedLawyers(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }

  function submit() {
    if (mode === "jefe" && !selectedJefe) return;
    if (mode === "abogado" && selectedLawyers.length === 0) return;
    
    setError(null);
    startTransition(async () => {
      try {
        if (mode === "jefe") {
          await deriveCasesToJefeMesa([caseId], selectedJefe);
        } else {
          await assignCasesToAbogados([caseId], selectedLawyers);
        }
        setOpen(false);
        setSelectedJefe("");
        setSelectedLawyers([]);
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={isLocked}
        className="text-xs px-3 py-1.5 rounded bg-[var(--bg)] text-[var(--gold)] hover:bg-black transition-all disabled:opacity-30 disabled:cursor-not-allowed uppercase font-bold tracking-widest"
      >
        Derivar
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--bg)]/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[var(--surface)] rounded border border-[var(--border-glass)] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-[var(--surface-2)] px-6 py-4 border-b border-[var(--border-glass)]">
              <h3 className="text-sm font-bold text-[var(--text)] uppercase tracking-wider">Asignación de Caso {caseCode}</h3>
              <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-widest mt-1">Estructura la defensa del cliente</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex bg-slate-100 p-1 rounded-sm gap-1">
                {role === "SUPER_ADMIN" && (
                  <button
                    onClick={() => setMode("jefe")}
                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all ${mode === "jefe" ? "bg-[var(--surface)] text-[var(--text)] shadow-sm" : "text-slate-400"}`}
                  >
                    Jefe de Mesa
                  </button>
                )}
                <button
                  onClick={() => setMode("abogado")}
                  className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all ${mode === "abogado" ? "bg-[var(--surface)] text-[var(--text)] shadow-sm" : "text-slate-400"}`}
                >
                  Multi-Abogados
                </button>
              </div>

              {mode === "jefe" ? (
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Responsable Estratégico</label>
                  <select
                    value={selectedJefe}
                    onChange={(e) => setSelectedJefe(e.target.value)}
                    className="w-full border border-slate-200 rounded px-3 py-2 text-sm outline-none focus:border-[var(--gold)]"
                  >
                    <option value="">Selecciona un Jefe de Mesa...</option>
                    {filteredJefes.map((m) => (
                      <option key={m.id} value={m.id}>{m.fullName}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Equipo Legal (1 o más)</label>
                  <div className="max-h-[200px] overflow-y-auto border border-slate-200 rounded divide-y divide-slate-100">
                    {abogados.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleLawyer(m.id)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[rgba(255,255,255,0.02)] transition-colors text-left"
                      >
                        <span className={`text-xs ${selectedLawyers.includes(m.id) ? "font-bold text-[var(--text)]" : "text-slate-600"}`}>
                          {m.fullName}
                        </span>
                        {selectedLawyers.includes(m.id) && <Check className="w-4 h-4 text-emerald-500" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 bg-[rgba(239,68,68,0.1)] border border-red-100 rounded text-red-600 text-[10px] font-bold uppercase">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <button
                  onClick={() => setOpen(false)}
                  className="text-[10px] font-bold uppercase tracking-widest px-4 py-2 text-slate-400 hover:text-slate-600"
                  disabled={pending}
                >
                  Cancelar
                </button>
                <button
                  onClick={submit}
                  disabled={pending || (mode === "jefe" ? !selectedJefe : selectedLawyers.length === 0)}
                  className="text-[10px] font-bold uppercase tracking-[0.2em] px-6 py-2 bg-[var(--bg)] text-[var(--gold)] rounded-sm hover:bg-black transition-all shadow-lg disabled:opacity-30"
                >
                  {pending ? "Asignando..." : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
