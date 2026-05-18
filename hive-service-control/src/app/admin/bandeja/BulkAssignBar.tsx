"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deriveCasesToJefeMesa, assignCasesToAbogados } from "./actions";
import { Check, X, Users, Loader2, UserCog, Scale } from "lucide-react";
import { StatusBanner } from "@/components/StatusBanner";

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
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[var(--bg)] text-white px-6 py-4 rounded-full shadow-2xl flex items-center gap-6 animate-in slide-in-from-bottom-10 fade-in duration-300">
        <div className="flex items-center gap-2">
          <div className="bg-[var(--sidebar-bg)] text-white font-bold w-6 h-6 rounded-full flex items-center justify-center text-xs">
            {selectedCaseIds.length}
          </div>
          <span className="text-xs font-bold uppercase tracking-widest">
            {selectedCaseIds.length === 1 ? "Caso seleccionado" : "Casos seleccionados"}
          </span>
        </div>
        
        <div className="w-px h-6 bg-white/20"></div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 bg-[var(--surface)] text-[var(--text)] px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--surface-2)] transition-colors"
          >
            <Users className="w-4 h-4" />
            Asignar
          </button>
          <button
            onClick={onClearSelection}
            className="p-2 text-white/70 hover:text-white transition-colors"
            title="Cancelar selección"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Assignment Modal */}
      {open && (
        <div
          role="presentation"
          onMouseDown={(e) => {
            if (pending) return;
            if (e.target === e.currentTarget) setOpen(false);
          }}
          className="fixed inset-0 z-50 grid place-items-center p-4 animate-in fade-in duration-150"
          style={{ background: "rgba(8, 9, 13, 0.55)", backdropFilter: "blur(2px)" }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="assign-title"
            className="w-full max-w-md rounded-2xl bg-[var(--surface)] shadow-[var(--shadow-xl)] animate-in zoom-in-95 duration-150 overflow-hidden"
            style={{ border: "1px solid var(--card-border)" }}
          >
            <div className="px-6 py-5 border-b" style={{ background: "var(--surface-2)", borderColor: "var(--card-border)" }}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 id="assign-title" className="text-base font-semibold text-[var(--text)]">
                    {mode === "jefe" ? "Derivar al Jefe de Grupo" : "Asignar al Equipo Legal"}
                  </h3>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {selectedCaseIds.length === 1
                      ? "Vas a operar sobre 1 caso seleccionado."
                      : `Vas a operar sobre ${selectedCaseIds.length} casos seleccionados.`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  aria-label="Cerrar"
                  className="rounded-md p-1.5 text-[var(--text-dim)] transition-colors hover:bg-[var(--btn-ghost-hover)] hover:text-[var(--text)] disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Mode tabs */}
              <div
                className="flex gap-1 p-1 rounded-lg"
                style={{ background: "var(--surface-3)", border: "1px solid var(--card-border)" }}
                role="tablist"
              >
                {role === "SUPER_ADMIN" && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "jefe"}
                    onClick={() => setMode("jefe")}
                    className={`flex-1 inline-flex items-center justify-center gap-2 py-2 px-3 text-[11px] font-semibold uppercase tracking-wider transition-all rounded-md ${
                      mode === "jefe"
                        ? "text-[var(--text)] shadow-sm"
                        : "text-[var(--text-muted)] hover:text-[var(--text)]"
                    }`}
                    style={mode === "jefe" ? { background: "var(--surface)" } : undefined}
                  >
                    <UserCog className="h-3.5 w-3.5" />
                    Jefe de Grupo
                  </button>
                )}
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "abogado"}
                  onClick={() => setMode("abogado")}
                  className={`flex-1 inline-flex items-center justify-center gap-2 py-2 px-3 text-[11px] font-semibold uppercase tracking-wider transition-all rounded-md ${
                    mode === "abogado"
                      ? "text-[var(--text)] shadow-sm"
                      : "text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                  style={mode === "abogado" ? { background: "var(--surface)" } : undefined}
                >
                  <Scale className="h-3.5 w-3.5" />
                  Equipo Legal
                </button>
              </div>

              {mode === "jefe" ? (
                <div className="space-y-2">
                  <label className="form-label">Responsable Estratégico</label>
                  <select
                    value={selectedJefe}
                    onChange={(e) => setSelectedJefe(e.target.value)}
                    className="form-input"
                  >
                    <option value="">Selecciona un Jefe de Grupo...</option>
                    {filteredJefes.map((m) => (
                      <option key={m.id} value={m.id}>{m.fullName}</option>
                    ))}
                  </select>
                  <p className="form-help">
                    El Jefe de Grupo seleccionado podrá asignar abogados a estos casos.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="form-label !mb-0">Equipo Legal (1 o más)</label>
                    <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                      {selectedLawyers.length === 0
                        ? "Ninguno seleccionado"
                        : `${selectedLawyers.length} seleccionado${selectedLawyers.length === 1 ? "" : "s"}`}
                    </span>
                  </div>
                  <div
                    className="max-h-[220px] overflow-y-auto rounded-lg divide-y"
                    style={{ border: "1px solid var(--card-border)", borderColor: "var(--card-border)" }}
                  >
                    {abogados.length === 0 ? (
                      <p className="px-4 py-6 text-center text-xs text-[var(--text-muted)]">
                        No hay abogados activos disponibles.
                      </p>
                    ) : (
                      abogados.map((m) => {
                        const selected = selectedLawyers.includes(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => toggleLawyer(m.id)}
                            className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-[var(--row-hover)] transition-colors text-left"
                            aria-pressed={selected}
                          >
                            <span className={`text-sm ${selected ? "font-semibold text-[var(--text)]" : "text-[var(--text-soft)]"}`}>
                              {m.fullName}
                            </span>
                            {selected && <Check className="w-4 h-4 text-[var(--green)]" />}
                          </button>
                        );
                      })
                    )}
                  </div>
                  <p className="form-help">
                    Los casos pasarán automáticamente a <strong className="text-[var(--text)]">En Proceso</strong> al confirmar.
                  </p>
                </div>
              )}

              {error && (
                <StatusBanner tone="error" title="No se pudo completar la asignación" assertive>
                  {error}
                </StatusBanner>
              )}
            </div>

            <div
              className="flex items-center justify-end gap-2 px-6 py-4"
              style={{ background: "var(--surface-2)", borderTop: "1px solid var(--card-border)" }}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-secondary"
                disabled={pending}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending || (mode === "jefe" ? !selectedJefe : selectedLawyers.length === 0)}
                className="btn-primary"
              >
                {pending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Procesando…
                  </>
                ) : (
                  <>Confirmar {mode === "jefe" ? "derivación" : "asignación"}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
