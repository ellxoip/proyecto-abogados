"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { TimeEntryModal } from "@/components/productividad/TimeEntryModal";

interface Props {
  caseId: string;
  caseCode: string;
  caseStage?: string;
}

export function TimeEntryButton({ caseId, caseCode, caseStage }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Registrar horas para ${caseCode}`}
        className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest transition-all"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--gold-border)",
          color: "var(--gold-deep)",
          boxShadow: "var(--shadow-sm)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--gold-dim)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--surface)";
        }}
      >
        <Clock className="w-3.5 h-3.5" />
        Registrar Horas
      </button>
      {open && (
        <TimeEntryModal
          caseId={caseId}
          caseCode={caseCode}
          caseStage={caseStage}
          onClose={() => setOpen(false)}
          onSuccess={() => setOpen(false)}
        />
      )}
    </>
  );
}
