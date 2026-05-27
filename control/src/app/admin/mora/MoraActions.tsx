"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCircle2 } from "lucide-react";
import { remindClient, regularizeCase } from "./actions";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { StatusBanner } from "@/components/StatusBanner";

interface MoraActionsProps {
  caseId: string;
  caseCode: string;
  clientName: string;
}

export function MoraActions({ caseId, caseCode, clientName }: MoraActionsProps) {
  const router = useRouter();
  const [openRemind, setOpenRemind] = useState(false);
  const [openRegularize, setOpenRegularize] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [, startTransition] = useTransition();

  function clearFeedback() {
    setFeedback(null);
  }

  async function doRemind() {
    try {
      await remindClient(caseId);
      setFeedback({ tone: "success", text: `Recordatorio enviado a ${clientName}.` });
      setOpenRemind(false);
      startTransition(() => router.refresh());
    } catch (e) {
      setFeedback({ tone: "error", text: (e as Error).message });
    }
  }

  async function doRegularize() {
    try {
      await regularizeCase(caseId);
      setFeedback({
        tone: "success",
        text: `Pago regularizado. ${caseCode} vuelve a la bandeja para validación.`,
      });
      setOpenRegularize(false);
      startTransition(() => router.refresh());
    } catch (e) {
      setFeedback({ tone: "error", text: (e as Error).message });
    }
  }

  return (
    <>
      {feedback && (
        <div className="absolute z-10 right-0 mt-12 w-[320px]">
          <StatusBanner tone={feedback.tone} onDismiss={clearFeedback}>
            {feedback.text}
          </StatusBanner>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpenRemind(true)}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all"
          style={{
            background: "var(--surface)",
            borderColor: "var(--card-border)",
            color: "var(--text-muted)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--gold)";
            e.currentTarget.style.color = "var(--gold-deep)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--card-border)";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
          title="Enviar recordatorio por WhatsApp al cliente"
        >
          <Bell className="w-3.5 h-3.5" />
          Recordar
        </button>

        <button
          type="button"
          onClick={() => setOpenRegularize(true)}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white transition-all"
          style={{
            background: "linear-gradient(180deg, var(--green) 0%, #15803D 100%)",
            boxShadow: "0 6px 14px -4px rgba(22, 163, 74, 0.35)",
          }}
          title="Marcar el pago como regularizado y reactivar el caso"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Regularizar
        </button>
      </div>

      <ConfirmDialog
        open={openRemind}
        title="Enviar recordatorio de pago"
        tone="info"
        description={
          <>
            Se enviará un <strong className="text-[var(--text)]">aviso WhatsApp</strong> al cliente{" "}
            <strong className="text-[var(--text)]">{clientName}</strong> sobre el caso{" "}
            <span className="font-mono text-[var(--text)]">{caseCode}</span>.
          </>
        }
        bullets={[
          "El mensaje se encola en la bandeja de envíos y se procesa en segundos.",
          "Queda registrado en la bitácora del caso (auditoría WHATSAPP_SENT).",
          "No modifica el estado del caso ni de la cuenta del cliente.",
        ]}
        confirmLabel="Enviar recordatorio"
        cancelLabel="Cancelar"
        onConfirm={doRemind}
        onClose={() => setOpenRemind(false)}
      />

      <ConfirmDialog
        open={openRegularize}
        title="Regularizar pago del caso"
        tone="warning"
        description={
          <>
            Vas a marcar como <strong className="text-[var(--text)]">regularizado</strong> el caso{" "}
            <span className="font-mono text-[var(--text)]">{caseCode}</span> del cliente{" "}
            <strong className="text-[var(--text)]">{clientName}</strong>. Esta acción es{" "}
            <strong className="text-[var(--text)]">reversible</strong>, pero modifica el estado del
            caso y reactiva la cuenta del cliente.
          </>
        }
        bullets={[
          "El caso vuelve al estado anterior (Abierto si no tenía abogado · En Proceso si ya lo tenía).",
          "La cuenta del cliente se reactiva (puede volver a iniciar sesión).",
          "Se encola un comprobante de pago al cliente vía WhatsApp + Email.",
          "Queda registrado como CASE_REACTIVATED en la bitácora.",
        ]}
        requireText={caseCode}
        confirmLabel="Sí, regularizar pago"
        cancelLabel="No, cancelar"
        onConfirm={doRegularize}
        onClose={() => setOpenRegularize(false)}
      />
    </>
  );
}
