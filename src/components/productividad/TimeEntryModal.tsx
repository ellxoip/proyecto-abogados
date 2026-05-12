"use client";

import { useState } from "react";
import { X, Clock, CheckCircle } from "lucide-react";
import { ActivityCategory } from "@prisma/client";

const ACTIVITY_OPTIONS: { value: ActivityCategory; label: string }[] = [
  { value: "INVESTIGACION", label: "Investigación" },
  { value: "REDACCION", label: "Redacción de documentos" },
  { value: "AUDIENCIAS", label: "Audiencias" },
  { value: "REUNIONES", label: "Reuniones con cliente" },
  { value: "GESTION_ADMINISTRATIVA", label: "Gestión administrativa" },
  { value: "OTRO", label: "Otro" },
];

interface TimeEntryModalProps {
  caseId: string;
  caseCode: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function TimeEntryModal({ caseId, caseCode, onClose, onSuccess }: TimeEntryModalProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    date: today,
    hours: "0",
    minutes: "30",
    category: "INVESTIGACION" as ActivityCategory,
    description: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const totalMinutes = parseInt(form.hours) * 60 + parseInt(form.minutes);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (totalMinutes < 1) { setError("La duración debe ser mayor a 0"); return; }
    if (totalMinutes > 1440) { setError("La duración máxima es 24 horas"); return; }
    if (form.date > today) { setError("La fecha no puede ser futura"); return; }

    setLoading(true);
    setError("");

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
        }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error al registrar"); return; }

      setSuccess(true);
      setTimeout(() => { onSuccess(); onClose(); }, 1500);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(13,17,23,0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-xl shadow-2xl overflow-hidden"
        style={{ background: "#FFFFFF", border: "1px solid var(--border-glass)" }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ background: "var(--bg)", borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md" style={{ background: "rgba(201,168,76,0.15)" }}>
              <Clock className="w-4 h-4" style={{ color: "var(--gold)" }} />
            </div>
            <div>
              <div className="text-sm font-bold text-[var(--text)]">Registrar Horas</div>
              <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                Expediente {caseCode}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--surface)]/10"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          <div className="p-8 flex flex-col items-center gap-3">
            <div className="p-4 rounded-full" style={{ background: "rgba(34, 197, 94, 0.1)" }}>
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <p className="font-bold text-[var(--text)]">¡Horas registradas!</p>
            <p className="text-sm text-[var(--text-muted)]">La entrada se guardó correctamente</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Date */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                Fecha
              </label>
              <input
                type="date"
                max={today}
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm border rounded-md outline-none focus:border-[var(--gold)] transition-colors"
                style={{ borderColor: "var(--border-glass)", background: "var(--surface)" }}
                required
              />
            </div>

            {/* Duration */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                Duración
              </label>
              <div className="flex gap-3">
                <div className="flex-1">
                  <select
                    value={form.hours}
                    onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm border rounded-md outline-none focus:border-[var(--gold)] transition-colors"
                    style={{ borderColor: "var(--border-glass)", background: "var(--surface)" }}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{i}h</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <select
                    value={form.minutes}
                    onChange={(e) => setForm((f) => ({ ...f, minutes: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm border rounded-md outline-none focus:border-[var(--gold)] transition-colors"
                    style={{ borderColor: "var(--border-glass)", background: "var(--surface)" }}
                  >
                    {[0, 15, 30, 45].map((m) => (
                      <option key={m} value={m}>{m}min</option>
                    ))}
                  </select>
                </div>
              </div>
              {totalMinutes > 0 && (
                <p className="text-[10px] mt-1" style={{ color: "var(--gold)" }}>
                  Total: {(totalMinutes / 60).toFixed(2)} horas
                </p>
              )}
            </div>

            {/* Category */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                Tipo de Actividad
              </label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ActivityCategory }))}
                className="w-full px-3 py-2.5 text-sm border rounded-md outline-none focus:border-[var(--gold)] transition-colors"
                style={{ borderColor: "var(--border-glass)", background: "var(--surface)" }}
              >
                {ACTIVITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                Descripción{" "}
                <span className="normal-case font-normal text-[var(--text-muted)]">(opcional)</span>
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                maxLength={500}
                placeholder="Breve descripción del trabajo realizado..."
                rows={3}
                className="w-full px-3 py-2.5 text-sm border rounded-md outline-none focus:border-[var(--gold)] transition-colors resize-none"
                style={{ borderColor: "var(--border-glass)", background: "var(--surface)" }}
              />
              <p className="text-[10px] text-right mt-0.5" style={{ color: "var(--text-muted)" }}>
                {form.description.length}/500
              </p>
            </div>

            {error && (
              <div className="px-3 py-2 rounded-md text-sm" style={{ background: "rgba(220, 38, 38, 0.1)", color: "var(--red)" }}>
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 text-sm font-bold rounded-md border transition-colors"
                style={{ borderColor: "var(--border-glass)", color: "var(--text-muted)" }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || totalMinutes < 1}
                className="flex-1 px-4 py-2.5 text-sm font-bold rounded-md transition-colors disabled:opacity-50 text-[var(--text)]"
                style={{ background: loading ? "var(--text-muted)" : "var(--gold)", color: "var(--text)" }}
              >
                {loading ? "Guardando..." : "Registrar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
