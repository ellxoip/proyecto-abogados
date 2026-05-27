"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { advanceToInProgress } from "./stage-actions";
import { Loader2, Play } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { StatusBanner } from "@/components/StatusBanner";

export function AdvanceStageButton({ caseId, caseCode }: { caseId: string; caseCode?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(
    null,
  );

  async function doAdvance() {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        try {
          const res = await advanceToInProgress(caseId);
          if (!res.success && "error" in res && res.error) {
            setFeedback({ tone: "error", text: res.error });
          } else {
            const wasAlready = "alreadyAdvanced" in res && res.alreadyAdvanced;
            setFeedback({
              tone: "success",
              text: wasAlready
                ? "El caso ya estaba en desarrollo."
                : "Caso avanzado a En Desarrollo. Puedes comenzar a registrar avances.",
            });
            setOpen(false);
            router.refresh();
          }
        } catch (err: any) {
          setFeedback({
            tone: "error",
            text: err?.message ?? "Error desconocido al avanzar el caso.",
          });
        } finally {
          resolve();
        }
      });
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={isPending}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-[11px] font-bold uppercase tracking-widest transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
          color: "#FFFFFF",
          boxShadow: "0 8px 18px -6px rgba(201, 168, 76, 0.40)",
        }}
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        {isPending ? "Avanzando..." : "Iniciar Desarrollo del Caso"}
      </button>

      {feedback && (
        <div className="w-[320px]">
          <StatusBanner tone={feedback.tone} onDismiss={() => setFeedback(null)}>
            {feedback.text}
          </StatusBanner>
        </div>
      )}

      <ConfirmDialog
        open={open}
        title="Iniciar desarrollo del caso"
        tone="default"
        description={
          <>
            Estas por avanzar el caso{caseCode ? (
              <>
                {" "}<span className="font-mono text-[var(--text)]">{caseCode}</span>
              </>
            ) : null}{" "}
            al estado <strong className="text-[var(--text)]">En Desarrollo</strong>. Esto indica que el
            equipo legal ya esta trabajando activamente en el expediente.
          </>
        }
        bullets={[
          "El cliente vera el caso como 'En Desarrollo' en su portal.",
          "Debe existir un abogado asignado previamente desde la Bandeja.",
          "Queda registrado en la bitacora (CASE_ASSIGNED).",
          "Podras registrar avances, comentarios y horas de trabajo desde ahora.",
        ]}
        confirmLabel="Si, iniciar desarrollo"
        cancelLabel="Cancelar"
        onConfirm={doAdvance}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
