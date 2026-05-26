"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  CheckCircle,
  AlertCircle,
  Clock,
  User as UserIcon,
  DollarSign,
  MessageSquare,
  ArrowRight,
  Activity,
  Pause,
  Play,
  PlayCircle,
  Bell,
  ShieldAlert,
  Database,
  X,
  ExternalLink,
} from "lucide-react";
import { formatHmsFromMinutes } from "@/lib/format-duration";

// ── Types ─────────────────────────────────────────────────────────────────
export type ActivityEvent = {
  id: string;
  action: string;
  message: string | null;
  metadata: string | null;
  status: string | null;
  template: string | null;
  channel: string | null;
  createdAt: string;
  caseId: string | null;
  caseCode: string | null;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
};

interface RecentActivityProps {
  activities?: ActivityEvent[];
}

// ── Helpers ───────────────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "Hace unos segundos";
  const min = Math.floor(sec / 60);
  if (min < 60) return `Hace ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `Hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `Hace ${days} d`;
  return date.toLocaleDateString("es-CL");
}

function exactTime(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type ActionMeta = {
  label: string;
  icon: any;
  iconBg: string;
  iconColor: string;
};

function metaForAction(action: string, status: string | null): ActionMeta {
  const flagged = status === "flagged" || status === "failed";
  const map: Record<string, Omit<ActionMeta, "label">> = {
    CASE_ASSIGNED: { icon: UserIcon, iconBg: "var(--blue-dim)", iconColor: "var(--blue)" },
    CASE_DERIVED: { icon: ArrowRight, iconBg: "var(--gold-dim)", iconColor: "var(--gold-deep)" },
    CASE_FINISHED: { icon: CheckCircle, iconBg: "var(--green-dim)", iconColor: "var(--green)" },
    CASE_HALTED: { icon: AlertCircle, iconBg: "var(--red-dim)", iconColor: "var(--red)" },
    CASE_REACTIVATED: { icon: Play, iconBg: "var(--green-dim)", iconColor: "var(--green)" },
    PAYMENT_RECORDED: { icon: DollarSign, iconBg: "var(--green-dim)", iconColor: "var(--green)" },
    TIME_ENTRY_LOGGED: { icon: Clock, iconBg: "var(--cyan-dim)", iconColor: "var(--cyan)" },
    TIME_ENTRY_FLAGGED: { icon: ShieldAlert, iconBg: "var(--red-dim)", iconColor: "var(--red)" },
    TIMER_STARTED: { icon: PlayCircle, iconBg: "var(--gold-dim)", iconColor: "var(--gold-deep)" },
    TIMER_PAUSED: { icon: Pause, iconBg: "var(--surface-3)", iconColor: "var(--text-muted)" },
    TIMER_ENTRY_LOGGED: { icon: Clock, iconBg: "var(--cyan-dim)", iconColor: "var(--cyan)" },
    TIMER_ENTRY_FLAGGED: { icon: ShieldAlert, iconBg: "var(--red-dim)", iconColor: "var(--red)" },
    DATA_EXPORTED: { icon: Database, iconBg: "var(--blue-dim)", iconColor: "var(--blue)" },
    WHATSAPP_SENT: { icon: MessageSquare, iconBg: "var(--green-dim)", iconColor: "var(--green)" },
    EMAIL_SENT: { icon: MessageSquare, iconBg: "var(--blue-dim)", iconColor: "var(--blue)" },
  };
  const labels: Record<string, string> = {
    CASE_ASSIGNED: "Caso asignado",
    CASE_DERIVED: "Caso derivado",
    CASE_FINISHED: "Caso finalizado",
    CASE_HALTED: "Caso detenido por mora",
    CASE_REACTIVATED: "Caso reactivado",
    PAYMENT_RECORDED: "Pago registrado",
    TIME_ENTRY_LOGGED: "Horas registradas",
    TIME_ENTRY_FLAGGED: "Horas marcadas para revisión",
    TIMER_STARTED: "Cronómetro iniciado",
    TIMER_PAUSED: "Cronómetro pausado",
    TIMER_ENTRY_LOGGED: "Cronómetro convertido a horas",
    TIMER_ENTRY_FLAGGED: "Sesión de cronómetro marcada",
    DATA_EXPORTED: "Datos exportados",
    WHATSAPP_SENT: "WhatsApp enviado",
    EMAIL_SENT: "Email enviado",
  };
  const fallback = { icon: Bell, iconBg: "var(--surface-3)", iconColor: "var(--text-muted)" };
  const m = map[action] ?? fallback;
  const label = labels[action] ?? action.replace(/_/g, " ").toLowerCase();
  if (flagged) {
    return {
      label,
      icon: m.icon,
      iconBg: "var(--red-dim)",
      iconColor: "var(--red)",
    };
  }
  return { label, ...m };
}

function describe(ev: ActivityEvent): string {
  if (ev.message) return ev.message;
  if (ev.caseCode) return `Sobre el caso ${ev.caseCode}`;
  return "Actividad del sistema";
}

function parseMetadata(meta: string | null): Record<string, unknown> | null {
  if (!meta) return null;
  try {
    const obj = JSON.parse(meta);
    if (obj && typeof obj === "object") return obj as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

// ── Detail modal ─────────────────────────────────────────────────────────
function ActivityDetailModal({
  ev,
  onClose,
}: {
  ev: ActivityEvent;
  onClose: () => void;
}) {
  const meta = metaForAction(ev.action, ev.status);
  const Icon = meta.icon;
  const parsed = parseMetadata(ev.metadata);
  const flagged = ev.status === "flagged" || ev.status === "failed";

  // Pull a few interesting fields out of metadata when present.
  const riskScore = parsed?.riskScore as number | undefined;
  const riskBand = parsed?.riskBand as string | undefined;
  const durationMinutes = parsed?.durationMinutes as number | undefined;
  const factors = Array.isArray(parsed?.factors) ? (parsed?.factors as Array<{ label: string; weight: number }>) : null;
  const ip = parsed?.clientIp ?? (parsed?.ip as string | undefined);
  const userAgent = parsed?.userAgent as string | undefined;
  const target = parsed?.target as string | undefined;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[55] flex items-center justify-center p-4 animate-in fade-in duration-150"
      style={{ background: "rgba(8,9,13,0.55)", backdropFilter: "blur(2px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-detail-title"
        className="w-full max-w-xl rounded-2xl bg-[var(--surface)] shadow-[var(--shadow-xl)] animate-in zoom-in-95 duration-150 overflow-hidden"
        style={{ border: "1px solid var(--card-border)" }}
      >
        <div
          className="px-6 py-5 flex items-start justify-between gap-3"
          style={{
            background: "linear-gradient(135deg, var(--sidebar-bg) 0%, #2E2B6A 100%)",
            color: "#FFFFFF",
            borderBottom: "1px solid var(--sidebar-border)",
          }}
        >
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl shrink-0"
              style={{ background: "rgba(255,255,255,0.12)" }}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-white">
                Evento auditado
              </p>
              <h3 id="activity-detail-title" className="mt-1 text-lg font-bold leading-snug">
                {meta.label}
              </h3>
              <p className="mt-1 text-[12px] text-white">{describe(ev)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          <Section label="Cuándo">
            <p className="text-sm text-[var(--text)]">{exactTime(ev.createdAt)}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{relativeTime(ev.createdAt)}</p>
          </Section>

          {(ev.actorName || ev.actorRole) && (
            <Section label="Responsable">
              <p className="text-sm text-[var(--text)]">{ev.actorName ?? "—"}</p>
              {ev.actorRole && (
                <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mt-0.5">
                  {ev.actorRole.replace(/_/g, " ").toLowerCase()}
                </p>
              )}
            </Section>
          )}

          {ev.caseCode && ev.caseId && (
            <Section label="Caso relacionado">
              <Link
                href={`/admin/casos/${ev.caseId}`}
                className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-[var(--gold-deep)] hover:underline"
                onClick={onClose}
              >
                {ev.caseCode}
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Section>
          )}

          {flagged && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border px-4 py-3 text-sm"
              style={{ background: "var(--red-dim)", borderColor: "var(--red-border)", color: "var(--red)" }}
            >
              <ShieldAlert className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>
                Este evento fue marcado para revisión del SuperAdmin. Mira los factores y la metadata
                forense abajo.
              </span>
            </div>
          )}

          {(typeof riskScore === "number" || riskBand || typeof durationMinutes === "number") && (
            <Section label="Indicadores">
              <div className="flex flex-wrap gap-2">
                {typeof riskScore === "number" && (
                  <Chip
                    label={`Score: ${riskScore}/100`}
                    tone={
                      riskBand === "HIGH"
                        ? "red"
                        : riskBand === "MEDIUM"
                        ? "amber"
                        : "green"
                    }
                  />
                )}
                {riskBand && (
                  <Chip
                    label={`Riesgo: ${riskBand}`}
                    tone={riskBand === "HIGH" ? "red" : riskBand === "MEDIUM" ? "amber" : "green"}
                  />
                )}
                {typeof durationMinutes === "number" && (
                  <Chip label={`Duración: ${formatHmsFromMinutes(durationMinutes)}`} tone="blue" />
                )}
                {target && <Chip label={`Destino: ${target}`} tone="muted" />}
              </div>
            </Section>
          )}

          {factors && factors.length > 0 && (
            <Section label="Factores de riesgo">
              <ul className="space-y-1.5">
                {factors.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs"
                    style={{ background: "var(--surface-3)", borderColor: "var(--card-border)" }}
                  >
                    <span className="text-[var(--text-soft)]">{f.label}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--card-border)" }}
                    >
                      +{f.weight}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {(ip || userAgent) && (
            <Section label="Origen">
              {ip && (
                <p className="text-xs text-[var(--text-muted)]">
                  <span className="font-semibold text-[var(--text)]">IP:</span> <code>{String(ip)}</code>
                </p>
              )}
              {userAgent && (
                <p className="mt-0.5 text-xs text-[var(--text-muted)] truncate" title={String(userAgent)}>
                  <span className="font-semibold text-[var(--text)]">User-Agent:</span> {String(userAgent)}
                </p>
              )}
            </Section>
          )}

          {parsed && (
            <details
              className="rounded-lg border p-3 text-xs"
              style={{ background: "var(--surface-3)", borderColor: "var(--card-border)" }}
            >
              <summary className="cursor-pointer text-[var(--text-muted)] font-semibold uppercase tracking-wider text-[10px]">
                Metadata forense completa
              </summary>
              <pre
                className="mt-2 overflow-x-auto font-mono text-[11px] leading-relaxed text-[var(--text-soft)]"
                style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
              >
                {JSON.stringify(parsed, null, 2)}
              </pre>
            </details>
          )}
        </div>

        <div
          className="flex items-center justify-end gap-2 px-6 py-3"
          style={{ background: "var(--surface-2)", borderTop: "1px solid var(--card-border)" }}
        >
          <button type="button" onClick={onClose} className="btn-secondary">
            Cerrar
          </button>
          {ev.caseId && (
            <Link href={`/admin/casos/${ev.caseId}`} className="btn-primary" onClick={onClose}>
              Ver expediente
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)] mb-1.5">
        {label}
      </p>
      {children}
    </div>
  );
}

function Chip({ label, tone }: { label: string; tone: "red" | "amber" | "green" | "blue" | "muted" }) {
  const styles =
    tone === "red"
      ? { bg: "var(--red-dim)", border: "var(--red-border)", color: "var(--red)" }
      : tone === "amber"
      ? { bg: "var(--amber-dim)", border: "var(--amber-border)", color: "var(--amber)" }
      : tone === "green"
      ? { bg: "var(--green-dim)", border: "var(--green-border)", color: "var(--green)" }
      : tone === "blue"
      ? { bg: "var(--blue-dim)", border: "var(--blue-border)", color: "var(--blue)" }
      : { bg: "var(--surface-3)", border: "var(--card-border)", color: "var(--text-muted)" };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
      style={{ background: styles.bg, borderColor: styles.border, color: styles.color }}
    >
      {label}
    </span>
  );
}

// ── Default (mock) fallback ──────────────────────────────────────────────
const FALLBACK_ACTIVITIES: ActivityEvent[] = [
  {
    id: "demo-1",
    action: "CASE_ASSIGNED",
    message: "Caso #2024-001 - Demanda Civil asignado al equipo",
    metadata: null,
    status: "ok",
    template: null,
    channel: "system",
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    caseId: null,
    caseCode: "2024-001",
    actorId: null,
    actorName: "Juan Pérez",
    actorRole: null,
  },
];

// ── Main component ───────────────────────────────────────────────────────
export function RecentActivity({ activities }: RecentActivityProps) {
  const items = activities && activities.length > 0 ? activities : FALLBACK_ACTIVITIES;
  const [selected, setSelected] = useState<ActivityEvent | null>(null);

  const isLive = useMemo(() => Boolean(activities && activities.length > 0), [activities]);

  return (
    <>
      <div
        className="rounded-[22px] border border-[var(--border-glass)] p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,253,0.98) 100%)",
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold" style={{ color: "var(--text)" }}>
              Actividad Reciente
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {isLive
                ? "Últimos eventos auditados del sistema · click para ver detalle forense"
                : "Últimos movimientos operativos del sistema"}
            </p>
          </div>
          <div
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{
              background: isLive
                ? "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)"
                : "var(--surface-3)",
              borderColor: isLive ? "var(--gold-border)" : "var(--card-border)",
              color: isLive ? "#FFFFFF" : "var(--text-muted)",
            }}
          >
            <Activity className="h-3.5 w-3.5" />
            {isLive ? "En tiempo real" : "Demo"}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {items.map((ev) => {
            const meta = metaForAction(ev.action, ev.status);
            const Icon = meta.icon;
            return (
              <button
                key={ev.id}
                type="button"
                onClick={() => setSelected(ev)}
                className="group w-full text-left flex items-start gap-4 rounded-2xl border border-[var(--border-glass)] bg-white/90 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--gold-border)] hover:shadow-[0_12px_26px_rgba(15,23,42,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
              >
                <div
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border"
                  style={{ background: meta.iconBg, borderColor: "var(--card-border)" }}
                >
                  <Icon className="h-5 w-5" style={{ color: meta.iconColor }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--text)" }}>
                        {meta.label}
                        {(ev.status === "flagged" || ev.status === "failed") && (
                          <span
                            className="rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                            style={{
                              background: "var(--red-dim)",
                              color: "var(--red)",
                              borderColor: "var(--red-border)",
                            }}
                          >
                            Marcado
                          </span>
                        )}
                      </h3>
                      <p className="mt-0.5 text-sm line-clamp-2" style={{ color: "var(--text-muted)" }}>
                        {ev.caseCode ? (
                          <>
                            <span className="font-mono font-semibold text-[var(--text-soft)]">{ev.caseCode}</span>
                            {" · "}
                          </>
                        ) : null}
                        {describe(ev)}
                      </p>
                      <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                        {ev.actorName && (
                          <>
                            <UserIcon size={12} />
                            <span className="truncate max-w-[160px]">{ev.actorName}</span>
                            <span>·</span>
                          </>
                        )}
                        <span title={exactTime(ev.createdAt)}>{relativeTime(ev.createdAt)}</span>
                      </div>
                    </div>
                    <ArrowRight className="mt-1 h-4 w-4 text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </div>
              </button>
            );
          })}

          {items.length === 0 && (
            <div className="p-8 text-center">
              <Activity className="mx-auto h-8 w-8 text-[var(--text-dim)] mb-2" />
              <p className="text-sm text-[var(--text-muted)]">Sin eventos auditados recientes.</p>
            </div>
          )}
        </div>
      </div>

      {selected && <ActivityDetailModal ev={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
