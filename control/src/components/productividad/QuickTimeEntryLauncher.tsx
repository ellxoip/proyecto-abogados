"use client";

import { useState } from "react";
import { Clock, Search, FolderOpen } from "lucide-react";
import { TimeEntryModal } from "@/components/productividad/TimeEntryModal";

interface CaseOption {
  id: string;
  code: string;
  clientName: string;
  stage: string;
}

interface QuickTimeEntryLauncherProps {
  /** Active cases the current lawyer is allowed to log time on. */
  cases: CaseOption[];
  /** Visual variant of the trigger button. */
  variant?: "primary" | "secondary";
  /** Custom label for the trigger. */
  label?: string;
}

export function QuickTimeEntryLauncher({
  cases,
  variant = "primary",
  label = "Registrar Horas",
}: QuickTimeEntryLauncherProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<CaseOption | null>(null);
  const [search, setSearch] = useState("");

  const filtered = cases.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.code.toLowerCase().includes(q) ||
      c.clientName.toLowerCase().includes(q)
    );
  });

  function openPicker() {
    setSearch("");
    setPickerOpen(true);
  }

  function chooseCase(c: CaseOption) {
    setSelected(c);
    setPickerOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className={variant === "primary" ? "btn-primary" : "btn-secondary"}
        title="Registrar horas trabajadas en un caso"
      >
        <Clock className="w-3.5 h-3.5" />
        {label}
      </button>

      {pickerOpen && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
          style={{ background: "rgba(8, 9, 13, 0.55)", backdropFilter: "blur(2px)" }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setPickerOpen(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl bg-[var(--surface)] shadow-[var(--shadow-xl)] animate-in zoom-in-95 duration-150 overflow-hidden"
            style={{ border: "1px solid var(--card-border)" }}
          >
            <div
              className="px-6 py-4"
              style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--card-border)" }}
            >
              <h3 className="text-base font-semibold text-[var(--text)]">¿Sobre qué caso?</h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Elige el expediente al que vas a imputar las horas.
              </p>
            </div>

            <div className="p-4 space-y-3">
              <div className="relative">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
                  style={{ color: "var(--text-dim)" }}
                />
                <input
                  type="search"
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por código o cliente…"
                  className="form-input pl-10"
                />
              </div>

              <div
                className="max-h-[300px] overflow-y-auto rounded-lg divide-y"
                style={{ border: "1px solid var(--card-border)", borderColor: "var(--card-border)" }}
              >
                {filtered.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <FolderOpen
                      aria-hidden
                      className="mx-auto mb-2 h-6 w-6"
                      style={{ color: "var(--text-dim)" }}
                    />
                    <p className="text-sm text-[var(--text-muted)]">
                      {cases.length === 0
                        ? "Aún no tienes casos asignados."
                        : "No hay coincidencias para tu búsqueda."}
                    </p>
                  </div>
                ) : (
                  filtered.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => chooseCase(c)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--row-hover)] transition-colors text-left"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-semibold text-[var(--text)] truncate">
                          {c.code}
                        </p>
                        <p className="text-xs text-[var(--text-muted)] truncate">
                          {c.clientName}
                        </p>
                      </div>
                      <span
                        className="ml-3 inline-flex flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                        style={{
                          background:
                            c.stage === "IN_PROGRESS"
                              ? "var(--blue-dim)"
                              : c.stage === "OPEN"
                              ? "var(--green-dim)"
                              : "var(--surface-3)",
                          borderColor: "var(--card-border)",
                          color:
                            c.stage === "IN_PROGRESS"
                              ? "var(--blue)"
                              : c.stage === "OPEN"
                              ? "var(--green)"
                              : "var(--text-muted)",
                        }}
                      >
                        {c.stage}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div
              className="flex items-center justify-end px-6 py-3"
              style={{ background: "var(--surface-2)", borderTop: "1px solid var(--card-border)" }}
            >
              <button type="button" onClick={() => setPickerOpen(false)} className="btn-secondary">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <TimeEntryModal
          caseId={selected.id}
          caseCode={selected.code}
          caseStage={selected.stage}
          onClose={() => setSelected(null)}
          onSuccess={() => setSelected(null)}
        />
      )}
    </>
  );
}
