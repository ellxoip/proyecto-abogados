"use client";

import { useState, useTransition } from "react";
import { advanceToInProgress } from "./stage-actions";
import { Play, AlertTriangle, Loader2 } from "lucide-react";

export function AdvanceStageButton({ caseId }: { caseId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await advanceToInProgress(caseId);
            if (!res.success && res.error) setError(res.error);
          });
        }}
        disabled={isPending}
        className="flex items-center gap-2 px-5 py-2.5 rounded-md text-[11px] font-bold uppercase tracking-widest transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
        style={{ background: "linear-gradient(135deg, var(--gold) 0%, #F5E9C8 100%)", color: "#0A0A0A" }}
      >
        {isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Play className="w-4 h-4" />
        )}
        {isPending ? "Avanzando..." : "Iniciar Desarrollo del Caso"}
      </button>

      {error && (
        <div className="text-[10px] text-[var(--red)] font-bold flex items-center gap-1.5 max-w-xs animate-in fade-in">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
