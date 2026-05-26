"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Play, ExternalLink } from "lucide-react";
import { StatusBanner } from "@/components/StatusBanner";

interface TimerLauncherProps {
  caseId: string;
  caseCode: string;
}

interface ConflictInfo {
  message: string;
  openCaseId?: string | null;
  openCaseCode?: string | null;
  openStatus?: string | null;
}

export function TimerLauncher({ caseId, caseCode }: TimerLauncherProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    setConflict(null);
    try {
      const res = await fetch("/api/productividad/timer/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.code === "ALREADY_OPEN") {
          setConflict({
            message: data.error ?? "Ya tienes una sesión abierta.",
            openCaseId: data.openCaseId ?? null,
            openCaseCode: data.openCaseCode ?? null,
            openStatus: data.openStatus ?? null,
          });
        } else {
          setError(data?.error ?? "No se pudo iniciar la sesión.");
        }
        return;
      }
      // Sesión arrancada (o reutilizada idempotentemente cuando el mismo
      // caso ya tenía una activa). Notificamos al widget para que
      // aparezca al instante sin esperar al poll de 30s.
      window.dispatchEvent(new CustomEvent("timer:started", { detail: { caseId } }));
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Error de red.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={start}
        disabled={pending}
        title={`Iniciar conteo automático para ${caseCode}`}
        className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-white transition-all"
        style={{
          background: "linear-gradient(180deg, var(--green) 0%, #15803D 100%)",
          boxShadow: "0 8px 18px -6px rgba(22, 163, 74, 0.4)",
        }}
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
        Iniciar Conteo
      </button>
      {conflict && (
        <div className="w-[320px]">
          <StatusBanner tone="warning" onDismiss={() => setConflict(null)}>
            <div className="space-y-2">
              <p>{conflict.message}</p>
              {conflict.openCaseId && conflict.openCaseId !== caseId ? (
                <Link
                  href={`/admin/casos/${conflict.openCaseId}`}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold underline underline-offset-2"
                >
                  <ExternalLink className="h-3 w-3" />
                  Ir al caso {conflict.openCaseCode ?? "abierto"}
                </Link>
              ) : (
                <p className="text-[11px]">
                  Usa el widget flotante en la esquina inferior derecha para pausar o cerrar la sesión actual.
                </p>
              )}
            </div>
          </StatusBanner>
        </div>
      )}
      {error && (
        <div className="w-[320px]">
          <StatusBanner tone="error" onDismiss={() => setError(null)}>
            {error}
          </StatusBanner>
        </div>
      )}
    </div>
  );
}
