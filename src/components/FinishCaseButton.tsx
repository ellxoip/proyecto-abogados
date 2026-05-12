"use client";

import { useState, useTransition } from "react";
import { finishCase } from "@/app/admin/casos/[id]/finish-actions";
import { CheckCircle, AlertTriangle } from "lucide-react";

export function FinishCaseButton({ caseId }: { caseId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const res = await finishCase(caseId);
              if (!res.success && res.error) {
                setError(res.error);
              }
            } catch (err: any) {
              setError(err.message || "Error desconocido al finalizar el caso.");
            }
          });
        }}
        disabled={isPending}
        className="flex items-center gap-2 bg-[#2A6B4F] text-[var(--text)] px-5 py-2.5 rounded-md text-[11px] font-bold uppercase tracking-widest hover:bg-[#1E4D39] transition-colors shadow-sm disabled:opacity-50"
      >
        <CheckCircle className="w-4 h-4" />
        {isPending ? "Validando..." : "Finalizar Caso"}
      </button>
      
      {error && (
        <div className="text-[10px] text-[var(--red)] font-bold flex items-center gap-1.5 max-w-xs text-right animate-in fade-in slide-in-from-top-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
