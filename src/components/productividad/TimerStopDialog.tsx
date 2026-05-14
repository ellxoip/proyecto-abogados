"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  Trash2,
  X,
  ShieldCheck,
} from "lucide-react";
import { ActivityCategory } from "@/lib/db-enums";
import { StatusBanner } from "@/components/StatusBanner";
import { HelpTip } from "@/components/HelpTip";

interface ActiveSessionInfo {
  id: string;
  caseCode: string;
  caseStage: string;
  clientName: string;
  startedAt: string;
  currentDurationMs: number;
  warned4h: boolean;
  warned8h: boolean;
  warned10h: boolean;
  autoPausedAt: string | null;
}

interface TimerStopDialogProps {
  session: ActiveSessionInfo;
  onClose: () => void;
  onSuccess: () => void;
}

const ACTIVITY_OPTIONS: { value: ActivityCategory; label: string }[] = [
  { value: "INVESTIGACION", label: "Investigación" },
  { value: "REDACCION", label: "Redacción de documentos" },
  { value: "AUDIENCIAS", label: "Audiencias" },
  { value: "REUNIONES", label: "Reuniones con cliente" },
  { value: "GESTION_ADMINISTRATIVA", label: "Gestión administrativa" },
  { value: "OTRO", label: "Otro" },
];

const REASON_MIN_CHARS = 20;
const DISCARD_REASON_MIN_CHARS = 10;
const LONG_ENTRY_MS = 8 * 60 * 60 * 1000;

function bandStyle(band: "LOW" | "MEDIUM" | "HIGH"): { bg: string; border: string; color: string; label: string } {
  if (band === "HIGH") return { bg: "var(--red-dim)", border: "var(--red-border)", color: "var(--red)", label: "Alto riesgo" };
  if (band === "MEDIUM") return { bg: "var(--amber-dim)", border: "var(--amber-border)", color: "var(--amber)", label: "Atención" };
  return { bg: "var(--green-dim)", border: "var(--green-border)", color: "var(--green)", label: "Bajo riesgo" };
}

function fmtDuration(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function TimerStopDialog({ session, onClose, onSuccess }: TimerStopDialogProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [mode, setMode] = useState<"save" | "discard">("save");
  const [form, setForm] = useState({
    description: "",
    category: "INVESTIGACION" as ActivityCategory,
    date: session.startedAt.slice(0, 10),
    lateReason: "",
    longEntryReason: "",
    closedCaseReason: "",
    discardReason: "",
    acknowledged: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);

  const durationMs = session.currentDurationMs;
  const durationMinutes = Math.max(1, Math.round(durationMs / 60000));
  const isLong = durationMs >= LONG_ENTRY_MS;
  const isClosedCase = session.caseStage === "FINISHED" || session.caseStage === "HALTED_BY_PAYMENT";
  const startedDate = new Date(session.startedAt);
  const daysLate = Math.max(0, Math.floor((Date.now() - startedDate.getTime()) / 86_400_000));
  const isLate = daysLate > 14;

  // Live preview of risk
  const previewScore = useMemo(() => {
    let s = 0;
    if (isLate) s += 30;
    if (isLong) s += 25;
    if (isClosedCase) s += 20;
    if (form.description.trim().length < 10) s += 15;
    if (form.category === "OTRO" && form.description.trim().length < 20) s += 10;
    if (session.warned10h) s += 25;
    else if (session.warned8h) s += 15;
    if (session.autoPausedAt) s += 20;
    return Math.min(100, s);
  }, [isLate, isLong, isClosedCase, form.description, form.category, session.warned8h, session.warned10h, session.autoPausedAt]);

  const riskBand: "LOW" | "MEDIUM" | "HIGH" =
    previewScore >= 60 ? "HIGH" : previewScore >= 30 ? "MEDIUM" : "LOW";
  const bs = bandStyle(riskBand);

  async function submitSave() {
    setError(null);
    setMissing([]);
    if (isLate && form.lateReason.trim().length < REASON_MIN_CHARS) {
      setMissing(["lateReason"]);
      setError(`Esta sesión tiene ${daysLate} días de retraso desde su inicio. Justifica el motivo.`);
      return;
    }
    if (isLong && form.longEntryReason.trim().length < REASON_MIN_CHARS) {
      setMissing(["longEntryReason"]);
      setError(`Sesión supera 8 h continuas. Justifica el alcance del trabajo.`);
      return;
    }
    if (isClosedCase && form.closedCaseReason.trim().length < REASON_MIN_CHARS) {
      setMissing(["closedCaseReason"]);
      setError("Justifica el registro sobre un caso cerrado.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/productividad/timer/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          durationMinutes,
          category: form.category,
          description: form.description.trim() || undefined,
          lateReason: form.lateReason.trim() || undefined,
          longEntryReason: form.longEntryReason.trim() || undefined,
          closedCaseReason: form.closedCaseReason.trim() || undefined,
          acknowledgedFraudWarnings: form.acknowledged,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.missing && Array.isArray(data.missing)) {
          setMissing(data.missing.map((m: any) => m.field));
          setError(data.error || "Se requieren justificaciones adicionales.");
        } else {
          setError(data?.error ?? "No se pudo cerrar la sesión.");
        }
        return;
      }
      onSuccess();
    } catch (err: any) {
      setError(err?.message ?? "Error de red.");
    } finally {
      setLoading(false);
    }
  }

  async function submitDiscard() {
    setError(null);
    if (form.discardReason.trim().length < DISCARD_REASON_MIN_CHARS) {
      setError(`Indica un motivo de descarte (mínimo ${DISCARD_REASON_MIN_CHARS} caracteres).`);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/productividad/timer/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discard: true, discardReason: form.discardReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "No se pudo descartar la sesión.");
        return;
      }
      onSuccess();
    } catch (err: any) {
      setError(err?.message ?? "Error de red.");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "save") submitSave();
    else submitDiscard();
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-in fade-in duration-150"
      style={{ background: "rgba(8,9,13,0.55)", backdropFilter: "blur(2px)" }}
      onMouseDown={(e) => {
        if (loading) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="timer-stop-title"
        className="w-full max-w-lg rounded-2xl bg-[var(--surface)] shadow-[var(--shadow-xl)] animate-in zoom-in-95 duration-150 overflow-hidden"
        style={{ border: "1px solid var(--card-border)" }}
      >
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--card-border)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="p-2 rounded-lg flex items-center justify-center"
              style={{ background: "var(--gold-dim)", border: "1px solid var(--gold-border)" }}
            >
              <Clock className="w-4 h-4" style={{ color: "var(--gold-deep)" }} />
            </div>
            <div className="min-w-0">
              <h3 id="timer-stop-title" className="text-base font-semibold text-[var(--text)]">
                Cierre de Sesión de Cronómetro
              </h3>
              <p className="text-xs text-[var(--text-muted)] truncate">
                Caso <span className="font-mono font-semibold text-[var(--text)]">{session.caseCode}</span>
                {" · "}
                {session.clientName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Cerrar"
            className="rounded-md p-1.5 text-[var(--text-dim)] transition-colors hover:bg-[var(--btn-ghost-hover)] hover:text-[var(--text)] disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Server-authoritative duration */}
          <div
            className="rounded-xl border p-4 flex items-center justify-between gap-3"
            style={{ background: "var(--surface-3)", borderColor: "var(--card-border)" }}
          >
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Duración medida por el servidor
              </p>
              <p
                className="mt-1 text-2xl font-bold text-[var(--text)]"
                style={{ letterSpacing: "-0.02em" }}
              >
                {fmtDuration(durationMs)}
                <span className="ml-2 text-sm font-medium text-[var(--text-muted)]">
                  · {durationMinutes} min
                </span>
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                Iniciada {new Date(session.startedAt).toLocaleString("es-CL")}
              </p>
            </div>
            <div
              className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider inline-flex items-center gap-1.5"
              style={{ background: bs.bg, borderColor: bs.border, color: bs.color }}
              title={`Score preliminar: ${previewScore}/100`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              {bs.label} · {previewScore}
            </div>
          </div>

          {/* Mode toggle */}
          <div
            className="flex gap-1 p-1 rounded-lg"
            style={{ background: "var(--surface-3)", border: "1px solid var(--card-border)" }}
            role="tablist"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "save"}
              onClick={() => setMode("save")}
              className={`flex-1 inline-flex items-center justify-center gap-2 py-2 px-3 text-[11px] font-semibold uppercase tracking-wider transition-all rounded-md ${
                mode === "save" ? "text-[var(--text)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
              style={mode === "save" ? { background: "var(--surface)" } : undefined}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Registrar horas
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "discard"}
              onClick={() => setMode("discard")}
              className={`flex-1 inline-flex items-center justify-center gap-2 py-2 px-3 text-[11px] font-semibold uppercase tracking-wider transition-all rounded-md ${
                mode === "discard" ? "text-[var(--text)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
              style={mode === "discard" ? { background: "var(--surface)" } : undefined}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Descartar
            </button>
          </div>

          {mode === "save" ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Fecha del trabajo</label>
                  <input
                    type="date"
                    max={today}
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    className="form-input"
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Tipo de actividad</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ActivityCategory }))}
                    className="form-input"
                  >
                    {ACTIVITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label inline-flex items-center gap-1.5">
                  Descripción del trabajo realizado
                  <HelpTip content="Describe brevemente qué hiciste durante la sesión. Sin descripción adecuada la entrada suma al score de riesgo." />
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  maxLength={500}
                  placeholder="Ej: Análisis del expediente, revisión de jurisprudencia citada por la contraparte y redacción de borrador del escrito."
                  rows={3}
                  className="form-input resize-none"
                />
                <div className="flex justify-between mt-1">
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {form.description.trim().length < 10 ? "Mínimo recomendado: 10 caracteres" : "Bien"}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">{form.description.length}/500</p>
                </div>
              </div>

              {(isLong || isLate || isClosedCase) && (
                <div
                  className="rounded-xl border p-4 space-y-3"
                  style={{ background: "var(--amber-dim)", borderColor: "var(--amber-border)" }}
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5" style={{ color: "var(--amber)" }} />
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--amber)" }}>
                        Esta sesión requiere justificación adicional por control interno
                      </p>
                      <p className="text-[11px] text-[var(--text-soft)] mt-0.5">
                        Por la trazabilidad de tus horas hombre, completa los campos siguientes.
                      </p>
                    </div>
                  </div>

                  {isLong && (
                    <div>
                      <label className="form-label">
                        Detalle de la sesión larga ({(durationMs / 3600_000).toFixed(1)} h){" "}
                        <span className="text-[var(--red)]">*</span>
                      </label>
                      <textarea
                        value={form.longEntryReason}
                        onChange={(e) => setForm((f) => ({ ...f, longEntryReason: e.target.value }))}
                        rows={2}
                        maxLength={500}
                        placeholder="Ej: Audiencia continua de 9:00 a 18:00 con receso de 30 min, sin interrupciones del expediente."
                        className={`form-input resize-none ${missing.includes("longEntryReason") ? "is-invalid" : ""}`}
                      />
                      <p className="form-help">
                        Mínimo {REASON_MIN_CHARS} caracteres ({form.longEntryReason.length}).
                      </p>
                    </div>
                  )}

                  {isLate && (
                    <div>
                      <label className="form-label">
                        Motivo del retraso ({daysLate} d) <span className="text-[var(--red)]">*</span>
                      </label>
                      <textarea
                        value={form.lateReason}
                        onChange={(e) => setForm((f) => ({ ...f, lateReason: e.target.value }))}
                        rows={2}
                        maxLength={500}
                        className={`form-input resize-none ${missing.includes("lateReason") ? "is-invalid" : ""}`}
                      />
                      <p className="form-help">
                        Mínimo {REASON_MIN_CHARS} caracteres ({form.lateReason.length}).
                      </p>
                    </div>
                  )}

                  {isClosedCase && (
                    <div>
                      <label className="form-label">
                        Motivo del registro sobre caso cerrado <span className="text-[var(--red)]">*</span>
                      </label>
                      <textarea
                        value={form.closedCaseReason}
                        onChange={(e) => setForm((f) => ({ ...f, closedCaseReason: e.target.value }))}
                        rows={2}
                        maxLength={500}
                        className={`form-input resize-none ${missing.includes("closedCaseReason") ? "is-invalid" : ""}`}
                      />
                      <p className="form-help">
                        Mínimo {REASON_MIN_CHARS} caracteres ({form.closedCaseReason.length}).
                      </p>
                    </div>
                  )}

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.acknowledged}
                      onChange={(e) => setForm((f) => ({ ...f, acknowledged: e.target.checked }))}
                      className="mt-0.5"
                    />
                    <span className="text-[11px] text-[var(--text-soft)] leading-snug">
                      Confirmo que la información es veraz y entiendo que esta sesión queda en bitácora del
                      SuperAdmin con score de riesgo, IP y user-agent.
                    </span>
                  </label>
                </div>
              )}

              <div
                className="flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-snug"
                style={{ background: "var(--blue-dim)", borderColor: "var(--blue-border)", color: "var(--blue)" }}
              >
                <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  La duración la calcula el servidor a partir del inicio/pausas. Si manipulaste el reloj de tu
                  equipo, sólo cuenta el tiempo medido en el backend.
                </span>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <StatusBanner tone="warning">
                Descartar la sesión NO crea horas registradas. La sesión queda en bitácora como DISCARDED para
                auditoría. Esta acción es irreversible.
              </StatusBanner>
              <div>
                <label className="form-label">
                  Motivo del descarte <span className="text-[var(--red)]">*</span>
                </label>
                <textarea
                  value={form.discardReason}
                  onChange={(e) => setForm((f) => ({ ...f, discardReason: e.target.value }))}
                  maxLength={500}
                  rows={3}
                  placeholder="Ej: Sesión iniciada por error · El trabajo se realizó sobre otro caso · No corresponde facturar."
                  className="form-input resize-none"
                />
                <p className="form-help">
                  Mínimo {DISCARD_REASON_MIN_CHARS} caracteres ({form.discardReason.length}).
                </p>
              </div>
            </div>
          )}

          {error && (
            <StatusBanner tone="error" title="No se pudo completar la operación" assertive>
              {error}
            </StatusBanner>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={loading} className="btn-secondary">
              Volver
            </button>
            <button
              type="submit"
              disabled={loading}
              className={mode === "save" ? "btn-primary" : "btn-danger"}
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Procesando…
                </>
              ) : mode === "save" ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Registrar horas
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" />
                  Descartar sesión
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
