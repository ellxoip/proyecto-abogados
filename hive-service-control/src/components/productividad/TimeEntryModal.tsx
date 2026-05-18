"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Clock, CheckCircle, AlertTriangle, ShieldCheck, Info, Loader2 } from "lucide-react";
import { ActivityCategory } from "@/lib/db-enums";
import { StatusBanner } from "@/components/StatusBanner";
import { HelpTip } from "@/components/HelpTip";

const ACTIVITY_OPTIONS: { value: ActivityCategory; label: string }[] = [
  { value: "INVESTIGACION", label: "Investigación" },
  { value: "REDACCION", label: "Redacción de documentos" },
  { value: "AUDIENCIAS", label: "Audiencias" },
  { value: "REUNIONES", label: "Reuniones con cliente" },
  { value: "GESTION_ADMINISTRATIVA", label: "Gestión administrativa" },
  { value: "OTRO", label: "Otro" },
];

const LONG_ENTRY_MIN = 480; // 8h
const LATE_DAYS = 14;
const REASON_MIN_CHARS = 20;

interface TimeEntryModalProps {
  caseId: string;
  caseCode: string;
  /** Optional: if the parent already knows the case stage, pre-warn for closed cases. */
  caseStage?: string;
  onClose: () => void;
  onSuccess: (info?: { riskBand?: string; riskScore?: number }) => void;
}

interface DayBudget {
  loading: boolean;
  totalMinutes: number;
  entryCount: number;
}

function bandStyle(band: "LOW" | "MEDIUM" | "HIGH" | undefined): {
  bg: string;
  border: string;
  color: string;
  label: string;
} {
  switch (band) {
    case "HIGH":
      return { bg: "var(--red-dim)", border: "var(--red-border)", color: "var(--red)", label: "Alto riesgo" };
    case "MEDIUM":
      return { bg: "var(--amber-dim)", border: "var(--amber-border)", color: "var(--amber)", label: "Atención" };
    default:
      return { bg: "var(--green-dim)", border: "var(--green-border)", color: "var(--green)", label: "Bajo riesgo" };
  }
}

export function TimeEntryModal({ caseId, caseCode, caseStage, onClose, onSuccess }: TimeEntryModalProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    date: today,
    hours: "0",
    minutes: "30",
    category: "INVESTIGACION" as ActivityCategory,
    description: "",
    lateReason: "",
    longEntryReason: "",
    closedCaseReason: "",
    acknowledgedFraudWarnings: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingReasons, setMissingReasons] = useState<string[]>([]);
  const [success, setSuccess] = useState<{ riskBand?: string; riskScore?: number } | null>(null);
  const [dayBudget, setDayBudget] = useState<DayBudget>({ loading: false, totalMinutes: 0, entryCount: 0 });

  const totalMinutes = parseInt(form.hours, 10) * 60 + parseInt(form.minutes, 10);

  // ── Cálculo en vivo del riesgo (espejo de las reglas server-side) ────────
  const daysLate = useMemo(() => {
    const entry = new Date(form.date);
    const now = new Date(today);
    return Math.max(0, Math.round((now.getTime() - entry.getTime()) / 86_400_000));
  }, [form.date, today]);

  const projectedDayMinutes = dayBudget.totalMinutes + totalMinutes;
  const overCap = projectedDayMinutes > 1440;
  const isLongEntry = totalMinutes > LONG_ENTRY_MIN;
  const isLateEntry = daysLate > LATE_DAYS;
  const isClosedCase = caseStage === "FINISHED" || caseStage === "HALTED_BY_PAYMENT";
  const isOverwork = projectedDayMinutes > 600;

  const riskScorePreview = useMemo(() => {
    let s = 0;
    if (isLateEntry) s += 30;
    if (isLongEntry) s += 25;
    if (isOverwork) s += 25;
    if (isClosedCase) s += 20;
    if ((form.description ?? "").trim().length < 10) s += 15;
    if (form.category === "OTRO" && (form.description ?? "").trim().length < 20) s += 10;
    if (dayBudget.entryCount >= 3) s += 5 + Math.min(20, dayBudget.entryCount * 2);
    return Math.min(100, s);
  }, [isLateEntry, isLongEntry, isOverwork, isClosedCase, form.description, form.category, dayBudget.entryCount]);

  const riskBand: "LOW" | "MEDIUM" | "HIGH" = riskScorePreview >= 60 ? "HIGH" : riskScorePreview >= 30 ? "MEDIUM" : "LOW";
  const bs = bandStyle(riskBand);

  // ── Recuperar las horas registradas para ese día (para el medidor) ───────
  useEffect(() => {
    let aborted = false;
    setDayBudget((b) => ({ ...b, loading: true }));
    const params = new URLSearchParams({ from: form.date, to: form.date });
    fetch(`/api/productividad/time-entries?${params.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (aborted) return;
        const entries: Array<{ durationMinutes: number }> = data?.entries ?? [];
        const total = entries.reduce((acc, e) => acc + (e.durationMinutes ?? 0), 0);
        setDayBudget({ loading: false, totalMinutes: total, entryCount: entries.length });
      })
      .catch(() => {
        if (!aborted) setDayBudget({ loading: false, totalMinutes: 0, entryCount: 0 });
      });
    return () => {
      aborted = true;
    };
  }, [form.date]);

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMissingReasons([]);

    if (totalMinutes < 1) { setError("La duración debe ser mayor a 0."); return; }
    if (totalMinutes > 1440) { setError("La duración máxima por entrada es 24 horas."); return; }
    if (form.date > today) { setError("La fecha no puede ser futura."); return; }
    if (overCap) {
      setError(
        `Superas el tope diario de 24 h. Hoy ya tienes ${(dayBudget.totalMinutes / 60).toFixed(2)} h registradas.`,
      );
      return;
    }
    if (isLateEntry && form.lateReason.trim().length < REASON_MIN_CHARS) {
      setMissingReasons(["lateReason"]);
      setError(`Esta entrada tiene ${daysLate} días de retraso. Detalla el motivo (mínimo ${REASON_MIN_CHARS} caracteres).`);
      return;
    }
    if (isLongEntry && form.longEntryReason.trim().length < REASON_MIN_CHARS) {
      setMissingReasons(["longEntryReason"]);
      setError(`Esta entrada supera las ${LONG_ENTRY_MIN / 60} h continuas. Detalla el alcance (mínimo ${REASON_MIN_CHARS} caracteres).`);
      return;
    }
    if (isClosedCase && form.closedCaseReason.trim().length < REASON_MIN_CHARS) {
      setMissingReasons(["closedCaseReason"]);
      setError(`El expediente está cerrado. Justifica el registro (mínimo ${REASON_MIN_CHARS} caracteres).`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/productividad/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          date: form.date,
          durationMinutes: totalMinutes,
          category: form.category,
          description: form.description.trim() || undefined,
          lateReason: form.lateReason.trim() || undefined,
          longEntryReason: form.longEntryReason.trim() || undefined,
          closedCaseReason: form.closedCaseReason.trim() || undefined,
          acknowledgedFraudWarnings: form.acknowledgedFraudWarnings,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        // Manejo granular del 422 con campos requeridos
        if (data?.missing && Array.isArray(data.missing)) {
          const fields = data.missing.map((m: { field: string }) => m.field);
          setMissingReasons(fields);
          setError(data.error || "Se requieren justificaciones adicionales.");
        } else if (data?.code === "DUPLICATE_RECENT") {
          setError(data.error);
        } else {
          setError(data?.error ?? "No se pudo registrar la entrada.");
        }
        return;
      }

      setSuccess({ riskBand: data.riskBand, riskScore: data.riskScore });
      setTimeout(() => {
        onSuccess({ riskBand: data.riskBand, riskScore: data.riskScore });
        onClose();
      }, 1800);
    } catch (err: any) {
      setError(err?.message ?? "Error de red al registrar la entrada.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
      style={{ background: "rgba(8, 9, 13, 0.55)", backdropFilter: "blur(2px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="time-entry-title"
        className="w-full max-w-lg rounded-2xl bg-[var(--surface)] shadow-[var(--shadow-xl)] animate-in zoom-in-95 duration-150 overflow-hidden"
        style={{ border: "1px solid var(--card-border)" }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--card-border)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-lg flex items-center justify-center"
              style={{ background: "var(--gold-dim)", border: "1px solid var(--gold-border)" }}
            >
              <Clock className="w-4 h-4" style={{ color: "var(--gold-deep)" }} />
            </div>
            <div>
              <h3 id="time-entry-title" className="text-base font-semibold text-[var(--text)]">
                Registrar Horas
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Expediente <span className="font-mono font-semibold text-[var(--text)]">{caseCode}</span>
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

        {success ? (
          <div className="p-10 flex flex-col items-center gap-3 text-center">
            <div
              className="p-4 rounded-full"
              style={{ background: "var(--green-dim)", border: "1px solid var(--green-border)" }}
            >
              <CheckCircle className="w-8 h-8" style={{ color: "var(--green)" }} />
            </div>
            <p className="text-base font-semibold text-[var(--text)]">¡Horas registradas con éxito!</p>
            <p className="text-sm text-[var(--text-muted)] max-w-sm">
              Tu trabajo quedó documentado con sello de auditoría. La firma puede verificarlo en
              cualquier momento.
            </p>
            {success.riskBand && (
              <div
                className="mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider"
                style={{
                  background: bandStyle(success.riskBand as any).bg,
                  borderColor: bandStyle(success.riskBand as any).border,
                  color: bandStyle(success.riskBand as any).color,
                }}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Riesgo: {bandStyle(success.riskBand as any).label}
                {typeof success.riskScore === "number" && ` · ${success.riskScore}/100`}
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Day budget */}
            <div
              className="rounded-xl border p-4"
              style={{ background: "var(--surface-3)", borderColor: "var(--card-border)" }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Horas ya registradas para {new Date(form.date).toLocaleDateString("es-CL")}
                  </p>
                  <p className="mt-1 text-xl font-bold text-[var(--text)]" style={{ letterSpacing: "-0.02em" }}>
                    {dayBudget.loading ? "…" : `${(dayBudget.totalMinutes / 60).toFixed(2)} h`}
                    <span className="text-xs font-medium text-[var(--text-muted)]"> / 24.00 h</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                    {dayBudget.entryCount} {dayBudget.entryCount === 1 ? "entrada previa" : "entradas previas"} ese día
                  </p>
                </div>
                <div
                  className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider inline-flex items-center gap-1.5"
                  style={{ background: bs.bg, borderColor: bs.border, color: bs.color }}
                  title={`Score de riesgo de esta entrada: ${riskScorePreview}/100`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {bs.label} · {riskScorePreview}
                </div>
              </div>
              {/* Progress bar */}
              <div className="progress-bar-track mt-3 h-2">
                <div
                  className={`progress-bar-fill ${overCap ? "progress-bar-fill--red" : isOverwork ? "progress-bar-fill--amber" : "progress-bar-fill--green"}`}
                  style={{ width: `${Math.min(100, (projectedDayMinutes / 1440) * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                Proyección con esta entrada:{" "}
                <strong className="text-[var(--text)]">
                  {(projectedDayMinutes / 60).toFixed(2)} h
                </strong>
                {overCap && (
                  <span className="text-[var(--red)] font-semibold"> · Supera el tope diario</span>
                )}
              </p>
            </div>

            {/* Date + Duration */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Fecha</label>
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
                <label className="form-label inline-flex items-center gap-1.5">
                  Duración
                  <HelpTip content="Horas y minutos efectivos trabajados. El sistema valida que no excedas el tope diario y que las entradas largas vengan justificadas." />
                </label>
                <div className="flex gap-2">
                  <select
                    value={form.hours}
                    onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
                    className="form-input"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{i} h</option>
                    ))}
                  </select>
                  <select
                    value={form.minutes}
                    onChange={(e) => setForm((f) => ({ ...f, minutes: e.target.value }))}
                    className="form-input"
                  >
                    {[0, 15, 30, 45].map((m) => (
                      <option key={m} value={m}>{m} min</option>
                    ))}
                  </select>
                </div>
                {totalMinutes > 0 && (
                  <p className="form-help">
                    Total esta entrada: <strong className="text-[var(--text)]">{(totalMinutes / 60).toFixed(2)} h</strong>
                  </p>
                )}
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="form-label">Tipo de Actividad</label>
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

            {/* Description */}
            <div>
              <label className="form-label">
                Descripción del trabajo realizado{" "}
                <span className="normal-case font-normal text-[var(--text-muted)]">(recomendado)</span>
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                maxLength={500}
                placeholder="Ej: Revisión del contrato anexo, redacción de cláusulas y envío al cliente para visado."
                rows={3}
                className="form-input resize-none"
              />
              <div className="flex justify-between mt-1">
                <p className="text-[11px] text-[var(--text-muted)]">
                  Sin descripción la entrada aporta más al score de riesgo.
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">{form.description.length}/500</p>
              </div>
            </div>

            {/* Conditional justifications */}
            {(isLateEntry || isLongEntry || isClosedCase) && (
              <div
                className="rounded-xl border p-4 space-y-3"
                style={{ background: "var(--amber-dim)", borderColor: "var(--amber-border)" }}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5" style={{ color: "var(--amber)" }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--amber)" }}>
                      Esta entrada requiere justificación adicional
                    </p>
                    <p className="text-[11px] text-[var(--text-soft)] mt-0.5">
                      Por integridad de la bitácora, completa los siguientes campos para que el
                      registro quede auditable.
                    </p>
                  </div>
                </div>

                {isLateEntry && (
                  <div>
                    <label className="form-label">
                      Motivo del retraso ({daysLate} días){" "}
                      <span className="text-[var(--red)]">*</span>
                    </label>
                    <textarea
                      value={form.lateReason}
                      onChange={(e) => setForm((f) => ({ ...f, lateReason: e.target.value }))}
                      maxLength={500}
                      placeholder="Ej: La actividad se realizó offline durante la audiencia y se registra ahora con el detalle."
                      rows={2}
                      className={`form-input resize-none ${missingReasons.includes("lateReason") ? "is-invalid" : ""}`}
                    />
                    <p className="form-help">
                      Mínimo {REASON_MIN_CHARS} caracteres ({form.lateReason.length}).
                    </p>
                  </div>
                )}

                {isLongEntry && (
                  <div>
                    <label className="form-label">
                      Detalle de la entrada larga ({(totalMinutes / 60).toFixed(1)} h){" "}
                      <span className="text-[var(--red)]">*</span>
                    </label>
                    <textarea
                      value={form.longEntryReason}
                      onChange={(e) => setForm((f) => ({ ...f, longEntryReason: e.target.value }))}
                      maxLength={500}
                      placeholder="Ej: Audiencia continua + redacción del fallo posterior, sin pausas mayores a 15 min."
                      rows={2}
                      className={`form-input resize-none ${missingReasons.includes("longEntryReason") ? "is-invalid" : ""}`}
                    />
                    <p className="form-help">
                      Mínimo {REASON_MIN_CHARS} caracteres ({form.longEntryReason.length}).
                    </p>
                  </div>
                )}

                {isClosedCase && (
                  <div>
                    <label className="form-label">
                      Motivo de registro sobre caso cerrado{" "}
                      <span className="text-[var(--red)]">*</span>
                    </label>
                    <textarea
                      value={form.closedCaseReason}
                      onChange={(e) => setForm((f) => ({ ...f, closedCaseReason: e.target.value }))}
                      maxLength={500}
                      placeholder="Ej: Cierre administrativo post-resolución, redacción del certificado final."
                      rows={2}
                      className={`form-input resize-none ${missingReasons.includes("closedCaseReason") ? "is-invalid" : ""}`}
                    />
                    <p className="form-help">
                      Mínimo {REASON_MIN_CHARS} caracteres ({form.closedCaseReason.length}).
                    </p>
                  </div>
                )}

                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.acknowledgedFraudWarnings}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, acknowledgedFraudWarnings: e.target.checked }))
                    }
                    className="mt-0.5"
                  />
                  <span className="text-[11px] text-[var(--text-soft)] leading-snug">
                    Confirmo que la información es veraz y entiendo que esta entrada queda marcada en
                    la bitácora del SuperAdmin con score de riesgo y mi IP.
                  </span>
                </label>
              </div>
            )}

            {/* Info banner about audit */}
            <div
              className="flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-snug"
              style={{ background: "var(--blue-dim)", borderColor: "var(--blue-border)", color: "var(--blue)" }}
            >
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>
                Cada registro queda en la bitácora del despacho con tu identidad, hora, IP, score de riesgo y motivo.
                El SuperAdmin puede revisarlo en cualquier momento.
              </span>
            </div>

            {error && (
              <StatusBanner tone="error" title="No se pudo registrar la entrada" assertive>
                {error}
              </StatusBanner>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} disabled={loading} className="btn-secondary">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || totalMinutes < 1 || overCap}
                className="btn-primary"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Registrando…
                  </>
                ) : (
                  <>Registrar horas</>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
