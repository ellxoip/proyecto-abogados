"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadDocumentAndUpdate } from "./upload-actions";
import { ModernModal } from "@/components/ModernModal";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  Loader2,
  Paperclip,
  Play,
  Send,
  X,
} from "lucide-react";

type TimerGateMode = "start" | "resume" | "blocked" | "error";

type TimerGateState = {
  mode: TimerGateMode;
  title: string;
  message: string;
  detail?: string;
};

interface UpdateFormProps {
  caseId: string;
  disabled?: boolean;
  userRole?: string;
}

export function UpdateForm({ caseId, disabled, userRole }: UpdateFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [isResolution, setIsResolution] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [checkingTimer, setCheckingTimer] = useState(false);
  const [timerGate, setTimerGate] = useState<TimerGateState | null>(null);
  const [timerActionPending, setTimerActionPending] = useState(false);
  // Lock duro mientras el operador (ABOGADO o JEFE_DE_MESA) no tenga timer
  // ACTIVE en este caso. Bloquea textarea + attach + submit. Se levanta al
  // iniciar/reanudar el conteo. SUPER_ADMIN queda exento.
  const requiresTimer = userRole === "ABOGADO" || userRole === "JEFE_DE_MESA";
  const [timerLocked, setTimerLocked] = useState<boolean>(requiresTimer);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const pendingFormDataRef = useRef<FormData | null>(null);
  const isLawyer = requiresTimer;

  // Al montar: si soy abogado, valido si hay timer ACTIVE para este caso.
  // Sin él, abro el modal y dejo el form bloqueado de entrada.
  useEffect(() => {
    if (!isLawyer || disabled) {
      setTimerLocked(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/productividad/timer", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          if (!cancelled) {
            setTimerLocked(true);
            setTimerGate({
              mode: "error",
              title: "No se pudo validar el conteo",
              message: data?.error ?? "El sistema no pudo confirmar si existe un conteo activo.",
              detail: "Recarga la página o vuelve a intentar.",
            });
          }
          return;
        }
        const open = data?.session;
        if (open?.caseId === caseId && open.status === "ACTIVE") {
          if (!cancelled) {
            setTimerLocked(false);
            setTimerGate(null);
          }
          return;
        }
        if (cancelled) return;
        setTimerLocked(true);
        if (open?.caseId === caseId && open.status === "PAUSED") {
          setTimerGate({
            mode: "resume",
            title: "Reanuda el conteo para registrar avances",
            message: "Este expediente tiene un conteo pausado. Reanudalo para poder escribir.",
            detail: "Mientras esté pausado no podrás registrar avances.",
          });
        } else if (open) {
          setTimerGate({
            mode: "blocked",
            title: "Hay otro conteo abierto",
            message: `Tienes una sesion ${open.status} en el caso ${open.caseCode ?? "actual"}.`,
            detail: "Detenla, registrala o descartala desde el widget antes de avanzar acá.",
          });
        } else {
          setTimerGate({
            mode: "start",
            title: "Inicia el conteo para registrar avances",
            message: "Para registrar avances del expediente debes iniciar el conteo de horas.",
            detail: "Cada gestión debe quedar asociada a una sesión real de trabajo.",
          });
        }
      } catch (err) {
        if (cancelled) return;
        setTimerLocked(true);
        setTimerGate({
          mode: "error",
          title: "No se pudo validar el conteo",
          message: err instanceof Error ? err.message : "Error de red al validar el conteo.",
          detail: "Recarga la página o vuelve a intentar.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLawyer, caseId, disabled]);

  // Escuchar evento global `timer:started` (dispatched por TimerLauncher,
  // TimerOnboardingPrompt o el botón del propio modal) → desbloquea form.
  useEffect(() => {
    if (!isLawyer) return;
    function onStarted(ev: Event) {
      const detail = (ev as CustomEvent).detail as { caseId?: string } | undefined;
      if (detail?.caseId === caseId) {
        setTimerLocked(false);
        setTimerGate(null);
      }
    }
    window.addEventListener("timer:started", onStarted);
    return () => window.removeEventListener("timer:started", onStarted);
  }, [caseId, isLawyer]);

  function buildFormData(form: HTMLFormElement) {
    const formData = new FormData(form);
    if (file) formData.set("document", file);
    if (isResolution) formData.set("isCaseResolution", "true");
    return formData;
  }

  function submitUpdate(formData: FormData) {
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const res = await uploadDocumentAndUpdate(caseId, formData);
      if (res.ok) {
        setSuccess(true);
        setFile(null);
        setIsResolution(false);
        formRef.current?.reset();
        router.refresh();
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(res.error || "Error desconocido");
      }
    });
  }

  async function hasActiveTimerForThisCase() {
    setCheckingTimer(true);
    try {
      const res = await fetch("/api/productividad/timer", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setTimerGate({
          mode: "error",
          title: "No se pudo validar el conteo",
          message: data?.error ?? "El sistema no pudo confirmar si existe un conteo activo.",
          detail: "Intenta nuevamente antes de publicar el avance.",
        });
        return false;
      }

      const openSession = data?.session;
      if (openSession?.caseId === caseId && openSession.status === "ACTIVE") return true;

      if (openSession?.caseId === caseId && openSession.status === "PAUSED") {
        setTimerGate({
          mode: "resume",
          title: "Reanuda el conteo para publicar",
          message: "Este expediente tiene un conteo pausado. Para publicar avances debes reanudarlo primero.",
          detail: "El avance quedara bloqueado hasta que el cronometro vuelva a estar activo.",
        });
        return false;
      }

      if (openSession) {
        setTimerGate({
          mode: "blocked",
          title: "Hay otro conteo abierto",
          message: `Tienes una sesion ${openSession.status} en el caso ${openSession.caseCode ?? "actual"}.`,
          detail: "Detenla, registrala o descartala desde el widget antes de publicar avances en este expediente.",
        });
        return false;
      }

      setTimerGate({
        mode: "start",
        title: "Inicia el conteo para publicar",
        message: "Para registrar avances del expediente debes iniciar el conteo de horas.",
        detail: "Esto fuerza que cada gestion quede asociada a una sesion real de trabajo.",
      });
      return false;
    } catch (err) {
      setTimerGate({
        mode: "error",
        title: "No se pudo validar el conteo",
        message: err instanceof Error ? err.message : "Error de red al validar el conteo.",
        detail: "Intenta nuevamente antes de publicar el avance.",
      });
      return false;
    } finally {
      setCheckingTimer(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (disabled || isPending || checkingTimer) return;
    setError(null);
    setSuccess(false);

    const formData = buildFormData(e.currentTarget);
    pendingFormDataRef.current = formData;

    if (!isLawyer) {
      pendingFormDataRef.current = null;
      submitUpdate(formData);
      return;
    }

    const canPublish = await hasActiveTimerForThisCase();
    if (!canPublish) return;
    pendingFormDataRef.current = null;
    submitUpdate(formData);
  }

  async function handleTimerGateAction() {
    if (!timerGate || timerGate.mode === "blocked" || timerGate.mode === "error") return;
    setTimerActionPending(true);
    setError(null);
    try {
      const endpoint =
        timerGate.mode === "resume"
          ? "/api/productividad/timer/resume"
          : "/api/productividad/timer/start";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: timerGate.mode === "start" ? { "Content-Type": "application/json" } : undefined,
        body: timerGate.mode === "start" ? JSON.stringify({ caseId }) : undefined,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setTimerGate({
          mode: "blocked",
          title: "No se pudo activar el conteo",
          message: data?.error ?? "El sistema rechazo el inicio del conteo.",
          detail: "Revisa el widget de conteo o cierra la sesion abierta antes de publicar.",
        });
        return;
      }

      window.dispatchEvent(new CustomEvent("timer:started", { detail: { caseId } }));
      setTimerGate(null);
      const formData = pendingFormDataRef.current;
      pendingFormDataRef.current = null;
      if (formData) submitUpdate(formData);
      router.refresh();
    } catch (err) {
      setTimerGate({
        mode: "error",
        title: "No se pudo activar el conteo",
        message: err instanceof Error ? err.message : "Error de red al iniciar el conteo.",
        detail: "Intenta nuevamente antes de publicar el avance.",
      });
    } finally {
      setTimerActionPending(false);
    }
  }

  return (
    <>
      <div id="registrar-avance" className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md shadow-sm overflow-hidden">
        <div className="px-6 py-3 border-b border-[var(--border-glass)] bg-[var(--surface-2)]">
          <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--gold)]">
            Registrar Avance del Caso
          </span>
        </div>
        <form ref={formRef} onSubmit={handleSubmit} className="p-6 space-y-4">
          {timerLocked && (
            <div
              className="flex items-start gap-3 rounded-md px-4 py-3 cursor-pointer"
              style={{
                background: "rgba(239,68,68,0.10)",
                border: "1px solid rgba(239,68,68,0.40)",
                color: "var(--red)",
              }}
              onClick={() => {
                // Re-abrir modal si el abogado lo cerró por accidente.
                if (!timerGate) {
                  setTimerGate({
                    mode: "start",
                    title: "Inicia el conteo para registrar avances",
                    message: "Para registrar avances del expediente debes iniciar el conteo de horas.",
                    detail: "Cada gestión debe quedar asociada a una sesión real de trabajo.",
                  });
                }
              }}
            >
              <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="text-[12px] leading-snug">
                <p className="font-bold">Inicia el conteo de horas para registrar avances en este expediente.</p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                  Click acá para iniciar el conteo · sin él no se permite escribir ni adjuntar documentos.
                </p>
              </div>
            </div>
          )}
          <textarea
            name="description"
            placeholder={
              timerLocked
                ? "Inicia el conteo de horas antes de escribir el avance..."
                : "Describa el avance: proximos pasos, documentacion entregada, resultado de gestiones..."
            }
            className="w-full h-28 p-4 text-sm border border-[var(--border-glass)] rounded-md outline-none focus:border-[var(--gold)] transition-colors resize-none bg-[var(--surface)] text-[var(--text)] disabled:cursor-not-allowed disabled:bg-[var(--surface-2)]"
            disabled={disabled || isPending || checkingTimer || timerLocked}
            onFocus={() => {
              // Defensa adicional: si por alguna razón el lock no estaba
              // y el abogado intentó enfocar, re-validar timer aquí.
              if (timerLocked && !timerGate) {
                setTimerGate({
                  mode: "start",
                  title: "Inicia el conteo para registrar avances",
                  message: "Para registrar avances del expediente debes iniciar el conteo de horas.",
                  detail: "Cada gestión debe quedar asociada a una sesión real de trabajo.",
                });
              }
            }}
            required
          />

          {file ? (
            <div className="flex items-center gap-3 px-4 py-3 rounded-md" style={{ background: "rgba(201, 168, 76, 0.08)", border: "1px solid rgba(201, 168, 76, 0.2)" }}>
              <FileText size={16} className="text-[var(--gold)] flex-shrink-0" />
              <span className="text-xs font-semibold text-[var(--text)] truncate flex-1">{file.name}</span>
              <span className="text-[10px] text-[var(--text-muted)]">{(file.size / 1024).toFixed(0)} KB</span>
              <button type="button" onClick={() => { setFile(null); setIsResolution(false); }} className="text-[var(--text-muted)] hover:text-[var(--red)] transition-colors">
                <X size={14} />
              </button>
            </div>
          ) : null}

          {file ? (
            <label className="flex items-center gap-2 text-[11px] font-semibold text-[var(--text-muted)]">
              <input
                type="checkbox"
                checked={isResolution}
                onChange={(e) => setIsResolution(e.target.checked)}
                disabled={disabled || isPending || checkingTimer || timerLocked}
                className="h-4 w-4 rounded border-[var(--border-glass)] accent-[var(--gold)]"
              />
              Marcar este adjunto como resolucion final del caso
            </label>
          ) : null}

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.txt"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setFile(f);
                    setIsResolution(false);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || isPending || checkingTimer || timerLocked}
                className="flex items-center gap-2 px-4 py-2.5 rounded-md text-[10px] font-bold uppercase tracking-widest border transition-colors hover:bg-[var(--surface-2)] disabled:opacity-40"
                style={{ borderColor: "var(--border-glass)", color: "var(--text-muted)" }}
                title="Formatos: PDF, Word, Excel, JPG, PNG, WebP, TXT (max. 25 MB)"
              >
                <Paperclip className="w-3.5 h-3.5" />
                Adjuntar Documento
              </button>
              <span className="text-[9px] uppercase tracking-widest hidden md:inline" style={{ color: "var(--text-dim)" }}>
                PDF - Word - Excel - JPG - PNG - 25 MB max
              </span>
            </div>

            <button
              type="submit"
              disabled={disabled || isPending || checkingTimer}
              className="flex items-center gap-2 px-6 py-2.5 rounded-md text-[11px] font-bold uppercase tracking-widest transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
              style={{ background: "var(--bg)", color: "var(--gold)" }}
            >
              {isPending || checkingTimer ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {checkingTimer ? "Validando conteo..." : isPending ? "Publicando..." : "Publicar e Informar"}
            </button>
          </div>

          {error && (
            <div className="text-[10px] text-[var(--red)] font-bold">{error}</div>
          )}
          {success && (
            <div className="flex items-center gap-2 text-xs font-bold" style={{ color: "#10B981" }}>
              <CheckCircle size={14} />
              Actualizacion registrada y notificada al cliente
            </div>
          )}
        </form>
      </div>

      {timerGate && (
        <ModernModal
          isOpen={Boolean(timerGate)}
          onClose={() => {
            if (!timerActionPending) setTimerGate(null);
          }}
          title={timerGate.title}
          size="sm"
          footer={
            <>
              {timerGate.mode !== "blocked" && timerGate.mode !== "error" ? (
                <button
                  type="button"
                  onClick={handleTimerGateAction}
                  disabled={timerActionPending}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[12px] font-bold uppercase tracking-wider text-white transition-all disabled:opacity-60"
                  style={{
                    background: "linear-gradient(180deg, var(--green) 0%, #15803D 100%)",
                    boxShadow: "0 8px 18px -6px rgba(22, 163, 74, 0.4)",
                  }}
                >
                  {timerActionPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  {timerGate.mode === "resume" ? "Reanudar conteo" : "Iniciar conteo"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setTimerGate(null)}
                  className="px-4 py-2 rounded-md text-[12px] font-semibold uppercase tracking-wider"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border-glass)",
                    color: "var(--text-muted)",
                  }}
                >
                  Entendido
                </button>
              )}
            </>
          }
        >
          <div className="space-y-4 text-[13px] leading-relaxed" style={{ color: "var(--text)" }}>
            <div className="flex items-start gap-3">
              <div
                className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
                style={{
                  background: "rgba(239,68,68,0.12)",
                  border: "1px solid rgba(239,68,68,0.35)",
                }}
              >
                {timerGate.mode === "blocked" || timerGate.mode === "error" ? (
                  <AlertTriangle className="w-5 h-5" style={{ color: "var(--red)" }} />
                ) : (
                  <Clock className="w-5 h-5" style={{ color: "var(--red)" }} />
                )}
              </div>
              <div>
                <p className="font-semibold mb-1" style={{ color: "var(--red)" }}>
                  {timerGate.message}
                </p>
                {timerGate.detail && (
                  <p style={{ color: "var(--text-muted)" }}>
                    {timerGate.detail}
                  </p>
                )}
              </div>
            </div>

            <div
              className="rounded-md px-3 py-2 text-[12px] font-semibold"
              style={{
                background: "rgba(239,68,68,0.10)",
                border: "1px solid rgba(239,68,68,0.35)",
                color: "var(--red)",
              }}
            >
              Validacion obligatoria: no se publicara el avance hasta que el conteo este activo en este expediente.
            </div>
          </div>
        </ModernModal>
      )}
    </>
  );
}
