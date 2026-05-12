"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deriveCasesToJefeMesa, assignCasesToAbogados } from "./actions";
import { Check, X, Users, Loader2 } from "lucide-react";

type Member = { id: string; fullName: string };

type Props = {
  selectedCaseIds: string[];
  jefes: Member[];
  abogados: Member[];
  onClearSelection: () => void;
  currentUserId: string;
  role: string;
};

export function BulkAssignBar({ selectedCaseIds, jefes, abogados, onClearSelection, currentUserId, role }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"jefe" | "abogado">(role === "SUPER_ADMIN" ? "jefe" : "abogado");
  const [selectedJefe, setSelectedJefe] = useState("");
  const [selectedLawyers, setSelectedLawyers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (selectedCaseIds.length === 0) return null;

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
           await deriveCasesToJefeMesa(selectedCaseIds, selectedJefe);
        } else {
           await assignCasesToAbogados(selectedCaseIds, selectedLawyers);
        }
        setOpen(false);
        setSelectedJefe("");
        setSelectedLawyers([]);
        onClearSelection();
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <>
      {/* Floating Action Bar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[var(--bg)] text-[var(--gold)] px-6 py-4 rounded-full shadow-2xl flex items-center gap-6 animate-in slide-in-from-bottom-10 fade-in duration-300">
        <div className="flex items-center gap-2">
          <div className="bg-[var(--gold)] text-[var(--text)] font-bold w-6 h-6 rounded-full flex items-center justify-center text-xs">
            {selectedCaseIds.length}
          </div>
          <span className="text-xs font-bold uppercase tracking-widest">
            {selectedCaseIds.length === 1 ? "Caso seleccionado" : "Casos seleccionados"}
          </span>
        </div>
        
        <div className="w-px h-6 bg-slate-700"></div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 bg-[var(--surface)] text-[var(--text)] px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-colors"
          >
            <Users className="w-4 h-4" />
            Asignar
          </button>
          <button
            onClick={onClearSelection}
            className="p-2 text-slate-400 hover:text-[var(--text)] transition-colors"
            title="Cancelar selección"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Assignment Modal */}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--bg)]/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[var(--surface)] rounded border border-[var(--border-glass)] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-[var(--surface-2)] px-6 py-4 border-b border-[var(--border-glass)]">
              <h3 className="text-sm font-bold text-[var(--text)] uppercase tracking-wider">
                Asignación Masiva ({selectedCaseIds.length} casos)
              </h3>
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
                  className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] px-6 py-2 bg-[var(--bg)] text-[var(--gold)] rounded-sm hover:bg-black transition-all shadow-lg disabled:opacity-30"
                >
                  {pending ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Procesando...
                    </>
                  ) : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
