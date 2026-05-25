"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Play, Clock, ExternalLink } from "lucide-react";
import { ModernModal } from "@/components/ModernModal";

interface TimerOnboardingPromptProps {
  caseId: string;
  caseCode: string;
}

interface OtherCaseSession {
  caseId: string;
  caseCode: string;
  status: string;
}

/**
 * Popup que se abre automáticamente CADA VEZ que el abogado entra al caso
 * asignado, recordándole iniciar el conteo de horas. Reutiliza
 * `<ModernModal>` (no introducimos otro componente modal).
 *
 * Reglas:
 *  - Si ya hay timer ACTIVE/PAUSED EN ESTE caso → no mostrar (silencio).
 *  - Si hay timer ACTIVE/PAUSED en OTRO caso → mostrar variante
 *    "Tienes un conteo en otro expediente" con link directo, sin botón
 *    de iniciar (el server respondería 409 igualmente).
 *  - En cualquier otro escenario → mostrar el prompt clásico de inicio.
 */
export function TimerOnboardingPrompt({ caseId, caseCode }: TimerOnboardingPromptProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otherCase, setOtherCase] = useState<OtherCaseSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/productividad/timer", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setOpen(true);
          return;
        }
        const data = await res.json();
        const live = data?.session && ["ACTIVE", "PAUSED"].includes(data.session.status)
          ? data.session
          : null;
        if (!live) {
          if (!cancelled) {
            setOtherCase(null);
            setOpen(true);
          }
          return;
        }
        if (live.caseId === caseId) {
          // Ya hay timer corriendo en este expediente — no molestar.
          if (!cancelled) setOpen(false);
          return;
        }
        // Sesión viva en otro expediente: mostrar prompt con CTA al caso
        // abierto en lugar de invitar a iniciar (que terminaría en 409).
        if (!cancelled) {
          setOtherCase({
            caseId: live.caseId,
            caseCode: live.caseCode ?? "abierto",
            status: live.status,
          });
          setOpen(true);
        }
      } catch {
        if (!cancelled) setOpen(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  function close() {
    setOpen(false);
  }

  async function startNow() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/productividad/timer/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.code === "ALREADY_OPEN" && data?.openCaseId && data?.openCaseId !== caseId) {
          setOtherCase({
            caseId: data.openCaseId,
            caseCode: data.openCaseCode ?? "abierto",
            status: data.openStatus ?? "ACTIVE",
          });
          return;
        }
        setError(data?.error ?? "No se pudo iniciar el conteo.");
        return;
      }
      window.dispatchEvent(new CustomEvent("timer:started", { detail: { caseId } }));
      close();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <ModernModal
      isOpen={open}
      onClose={close}
      title={otherCase ? "Conteo abierto en otro expediente" : "Inicia el conteo de horas"}
      size="sm"
      footer={
        otherCase ? (
          <>
            <button
              type="button"
              onClick={close}
              className="px-4 py-2 rounded-md text-[12px] font-semibold uppercase tracking-wider transition-all"
              style={{
                background: "transparent",
                border: "1px solid var(--border-glass)",
                color: "var(--text-muted)",
              }}
            >
              Cerrar aviso
            </button>
            <Link
              href={`/admin/casos/${otherCase.caseId}`}
              onClick={close}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[12px] font-bold uppercase tracking-wider text-white transition-all"
              style={{
                background: "linear-gradient(180deg, var(--gold) 0%, var(--gold-deep) 100%)",
                boxShadow: "0 8px 18px -6px rgba(201, 168, 76, 0.5)",
              }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Ir al caso {otherCase.caseCode}
            </Link>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={close}
              disabled={starting}
              className="px-4 py-2 rounded-md text-[12px] font-semibold uppercase tracking-wider transition-all disabled:opacity-60"
              style={{
                background: "transparent",
                border: "1px solid var(--border-glass)",
                color: "var(--text-muted)",
              }}
            >
              Más tarde
            </button>
            <button
              type="button"
              onClick={startNow}
              disabled={starting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[12px] font-bold uppercase tracking-wider text-white transition-all disabled:opacity-60"
              style={{
                background: "linear-gradient(180deg, var(--green) 0%, #15803D 100%)",
                boxShadow: "0 8px 18px -6px rgba(22, 163, 74, 0.4)",
              }}
            >
              {starting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              Iniciar conteo ahora
            </button>
          </>
        )
      }
    >
      <div className="space-y-4 text-[13px] leading-relaxed" style={{ color: "var(--text)" }}>
        {otherCase ? (
          <div className="flex items-start gap-3">
            <div
              className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
              style={{
                background: "rgba(201,168,76,0.12)",
                border: "1px solid rgba(201,168,76,0.35)",
              }}
            >
              <Clock className="w-5 h-5" style={{ color: "var(--gold)" }} />
            </div>
            <div>
              <p className="font-semibold mb-1">
                Tienes un conteo {otherCase.status === "PAUSED" ? "pausado" : "activo"} en el caso{" "}
                <span className="font-mono">{otherCase.caseCode}</span>.
              </p>
              <p style={{ color: "var(--text-muted)" }}>
                Solo puedes tener una sesión abierta a la vez. Ciérrala o descártala desde el
                expediente correspondiente antes de iniciar otra en{" "}
                <span className="font-mono">{caseCode}</span>.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <div
              className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
              style={{
                background: "rgba(34,197,94,0.12)",
                border: "1px solid rgba(34,197,94,0.3)",
              }}
            >
              <Clock className="w-5 h-5" style={{ color: "var(--green)" }} />
            </div>
            <div>
              <p className="font-semibold mb-1">
                Estás en el expediente <span className="font-mono">{caseCode}</span>.
              </p>
              <p style={{ color: "var(--text-muted)" }}>
                Para que tu trabajo quede registrado y no pierdas horas facturables,
                activa el conteo automático antes de empezar a gestionar el caso.
              </p>
            </div>
          </div>
        )}

        {!otherCase && (
        <div
          className="rounded-md p-3 text-[12px]"
          style={{
            background: "var(--surface-alt, rgba(255,255,255,0.03))",
            border: "1px solid var(--border-glass)",
          }}
        >
          <p className="font-semibold mb-2" style={{ color: "var(--text)" }}>
            ¿Qué hace "Iniciar conteo"?
          </p>
          <ul className="space-y-1.5 list-disc pl-5" style={{ color: "var(--text-muted)" }}>
            <li>Crea una sesión de trabajo asociada a este caso.</li>
            <li>Mide el tiempo automáticamente mientras la pestaña esté abierta.</li>
            <li>Aparece un widget flotante en la esquina inferior derecha para pausar o cerrar la sesión.</li>
            <li>Al cerrar la sesión, el tiempo se suma a tus horas registradas del caso.</li>
          </ul>
        </div>
        )}

        {!otherCase && (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Puedes cerrar este aviso y usar el botón <strong>Iniciar Conteo</strong> de la cabecera cuando quieras.
        </p>
        )}

        {error && (
          <div
            className="rounded-md px-3 py-2 text-[12px] font-semibold"
            style={{
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.4)",
              color: "#FCA5A5",
            }}
          >
            {error}
          </div>
        )}
      </div>
    </ModernModal>
  );
}
