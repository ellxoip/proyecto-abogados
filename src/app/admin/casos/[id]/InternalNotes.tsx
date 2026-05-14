"use client";

import { useState, useTransition } from "react";
import { saveInternalNotes } from "./notes-actions";
import { StickyNote, Save, CheckCircle } from "lucide-react";

type Props = {
  caseId: string;
  initialNotes: string;
};

export function InternalNotes({ caseId, initialNotes }: Props) {
  const [notes, setNotes] = useState(initialNotes);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setSaved(false);
    startTransition(async () => {
      await saveInternalNotes(caseId, notes);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md shadow-sm overflow-hidden">
      <div className="px-6 py-3 border-b border-[var(--border-glass)] bg-gradient-to-r from-[rgba(201,168,76,0.1)] to-[var(--surface-2)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-[var(--gold)]" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--gold)]">
            Notas Internas Confidenciales
          </span>
        </div>
        <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--gold)] bg-[var(--gold)15] px-2 py-0.5 rounded-full">
          Solo SuperAdmin / Jefe de Grupo
        </span>
      </div>
      <div className="p-6 space-y-3">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Escribe notas confidenciales sobre este caso. Solo visibles para SuperAdmin y Jefe de Grupo..."
          className="w-full h-28 p-4 text-sm border border-[var(--border-glass)] rounded-md outline-none focus:border-[var(--gold)] transition-colors resize-none bg-[var(--surface)] text-[var(--text)]"
          disabled={isPending}
        />
        <div className="flex items-center justify-between">
          <div>
            {saved && (
              <div className="flex items-center gap-1.5 text-green-600 animate-in fade-in duration-300">
                <CheckCircle className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Notas guardadas</span>
              </div>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-2 bg-[var(--bg)] text-white px-5 py-2.5 rounded-md text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--border-subtle)] transition-colors disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {isPending ? "Guardando..." : "Guardar Notas"}
          </button>
        </div>
      </div>
    </div>
  );
}
