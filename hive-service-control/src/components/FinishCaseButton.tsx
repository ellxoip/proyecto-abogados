"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { finishCase } from "@/app/admin/casos/[id]/finish-actions";
import { CheckCircle } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { StatusBanner } from "@/components/StatusBanner";

export function FinishCaseButton({ caseId, caseCode }: { caseId: string; caseCode?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(
    null,
  );

  async function doFinish() {
    try {
      const res = await finishCase(caseId);
      if (!res.success && res.error) {
        setFeedback({ tone: "error", text: res.error });
        return;
      }
      setFeedback({
        tone: "success",
        text: "Caso finalizado. Se generó el certificado y se notificó al cliente.",
      });
      setOpen(false);
      router.refresh();
    } catch (err: any) {
      setFeedback({ tone: "error", text: err?.message ?? "Error desconocido al finalizar el caso." });
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest text-white transition-all shadow-sm"
        style={{
          background: "linear-gradient(180deg, var(--green) 0%, #15803D 100%)",
          boxShadow: "0 8px 18px -6px rgba(22, 163, 74, 0.40)",
        }}
      >
        <CheckCircle className="w-4 h-4" />
        Finalizar Caso
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
        title="Finalizar caso"
        tone="warning"
        description={
          <>
            Estás por <strong className="text-[var(--text)]">cerrar definitivamente</strong> este
            caso{caseCode ? (
              <>
                {" "}(<span className="font-mono text-[var(--text)]">{caseCode}</span>)
              </>
            ) : null}
            . Esta acción cierra el expediente y notifica al cliente con un certificado oficial de
            término.
          </>
        }
        bullets={[
          "El caso pasa a estado FINALIZADO y queda en modo lectura.",
          "Se genera un Certificado de Término con URL firmada para el cliente.",
          "Se notifica al cliente vía WhatsApp y Email.",
          "Queda registrado en la bitácora (CASE_FINISHED).",
          "Esta operación se puede revertir solo por SuperAdmin desde la administración.",
        ]}
        requireText={caseCode}
        confirmLabel="Sí, finalizar caso"
        cancelLabel="Cancelar"
        onConfirm={doFinish}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
