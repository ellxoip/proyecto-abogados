"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { TimeEntryModal } from "@/components/productividad/TimeEntryModal";

interface Props {
  caseId: string;
  caseCode: string;
}

export function TimeEntryButton({ caseId, caseCode }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-md text-[11px] font-bold uppercase tracking-widest border transition-colors hover:bg-[var(--surface-2)]"
        style={{ borderColor: "var(--gold)", color: "var(--gold)", background: "transparent" }}
      >
        <Clock className="w-3.5 h-3.5" />
        Registrar Horas
      </button>
      {open && (
        <TimeEntryModal
          caseId={caseId}
          caseCode={caseCode}
          onClose={() => setOpen(false)}
          onSuccess={() => setOpen(false)}
        />
      )}
    </>
  );
}
