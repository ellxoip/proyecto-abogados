import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { Role } from "@/lib/db-enums";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Pause,
  Play,
  ShieldAlert,
  Timer,
  Trash2,
  XCircle,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { HelpTip } from "@/components/HelpTip";
import { computeCurrentDurationMs, readEvents } from "@/lib/productividad/timer-state";

const STATUS_META: Record<string, { label: string; bg: string; color: string; border: string; icon: any }> = {
  ACTIVE: { label: "En curso", bg: "var(--green-dim)", color: "var(--green)", border: "var(--green-border)", icon: Play },
  PAUSED: { label: "Pausada", bg: "var(--surface-3)", color: "var(--text-muted)", border: "var(--card-border)", icon: Pause },
  PENDING_CLOSE: { label: "Cierre pendiente", bg: "var(--amber-dim)", color: "var(--amber)", border: "var(--amber-border)", icon: AlertTriangle },
  COMPLETED: { label: "Completada", bg: "var(--blue-dim)", color: "var(--blue)", border: "var(--blue-border)", icon: CheckCircle2 },
  FLAGGED: { label: "Marcada", bg: "var(--red-dim)", color: "var(--red)", border: "var(--red-border)", icon: ShieldAlert },
  DISCARDED: { label: "Descartada", bg: "var(--surface-3)", color: "var(--text-dim)", border: "var(--card-border)", icon: Trash2 },
};

function fmt(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

type SearchParams = { status?: string; lawyer?: string; band?: string };

export default async function TimerSessionsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session) return notFound();
  if (session.user.role !== Role.SUPER_ADMIN) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <EmptyState
          icon={ShieldAlert}
          title="Vista restringida"
          description="Solo el SuperAdmin puede auditar las sesiones automáticas de cronómetro."
        />
      </div>
    );
  }

  const statusFilter = searchParams.status?.toUpperCase();
  const lawyerFilter = searchParams.lawyer;
  const bandFilter = searchParams.band?.toUpperCase();

  const { sessions, lawyers, stats } = await withRls(async (tx) => {
    const sessions = await tx.timerSession.findMany({
      where: {
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(lawyerFilter ? { lawyerId: lawyerFilter } : {}),
        ...(bandFilter ? { riskBand: bandFilter } : {}),
      },
      include: {
        lawyer: { select: { id: true, fullName: true } },
        case: { select: { id: true, code: true, stage: true, client: { select: { fullName: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const lawyers = await tx.user.findMany({
      where: { role: { in: [Role.ABOGADO, Role.JEFE_DE_MESA, Role.SUPER_ADMIN] }, active: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    });

    const allCounts = await tx.timerSession.groupBy({ by: ["status"], _count: { id: true } });
    const counts: Record<string, number> = {};
    for (const c of allCounts) counts[c.status] = c._count.id;

    return { sessions, lawyers, stats: counts };
  });

  const now = new Date();

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text)] font-serif">
            Auditoría de Sesiones de Cronómetro
          </h1>
          <HelpTip
            content="Cada sesión automática queda registrada con su inicio, pausas, advertencias, cierre y eventual conversión a TimeEntry. Las marcadas en rojo requieren revisión."
            size="md"
            asInfo
          />
        </div>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Trazabilidad de punta a punta del ciclo de vida del tiempo trabajado por cada abogado.
        </p>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {(["ACTIVE", "PAUSED", "PENDING_CLOSE", "COMPLETED", "FLAGGED", "DISCARDED"] as const).map((s) => {
          const meta = STATUS_META[s];
          const Icon = meta.icon;
          return (
            <Link
              key={s}
              href={statusFilter === s ? "/admin/productividad/sesiones" : `/admin/productividad/sesiones?status=${s}`}
              className="block rounded-lg p-3 border transition-all hover:shadow-md"
              style={{
                background: statusFilter === s ? meta.bg : "var(--surface)",
                borderColor: statusFilter === s ? meta.border : "var(--card-border)",
              }}
            >
              <div className="flex items-center justify-between">
                <Icon className="w-4 h-4" style={{ color: meta.color }} />
                <span className="text-2xl font-bold text-[var(--text)]">{stats[s] ?? 0}</span>
              </div>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: meta.color }}>
                {meta.label}
              </p>
            </Link>
          );
        })}
      </div>

      {/* Filters */}
      <div
        className="flex flex-wrap items-center gap-2 rounded-xl border p-3"
        style={{ background: "var(--surface-2)", borderColor: "var(--card-border)" }}
      >
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Filtros:</span>
        <form className="flex flex-wrap items-center gap-2" action="/admin/productividad/sesiones">
          <select
            name="lawyer"
            defaultValue={lawyerFilter ?? ""}
            className="form-input !py-1.5 text-xs w-auto"
            style={{ minWidth: 180 }}
          >
            <option value="">Todos los abogados</option>
            {lawyers.map((l) => (
              <option key={l.id} value={l.id}>{l.fullName}</option>
            ))}
          </select>
          <select
            name="band"
            defaultValue={bandFilter ?? ""}
            className="form-input !py-1.5 text-xs w-auto"
          >
            <option value="">Cualquier riesgo</option>
            <option value="LOW">Bajo</option>
            <option value="MEDIUM">Atención</option>
            <option value="HIGH">Alto</option>
          </select>
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          <button type="submit" className="btn-secondary text-xs">Aplicar</button>
          <Link href="/admin/productividad/sesiones" className="btn-ghost text-xs">Limpiar</Link>
        </form>
      </div>

      {/* Table */}
      <div
        className="rounded-xl border shadow-sm overflow-hidden"
        style={{ background: "var(--surface)", borderColor: "var(--card-border)" }}
      >
        {sessions.length === 0 ? (
          <EmptyState
            icon={Timer}
            title="Sin sesiones en estos criterios"
            description="Cuando los abogados usen el cronómetro automático, las sesiones aparecerán aquí con trazabilidad completa."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px]">
              <thead>
                <tr style={{ background: "var(--surface-3)" }}>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[var(--gold-deep)]">Estado</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[var(--gold-deep)]">Abogado</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[var(--gold-deep)]">Caso</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[var(--gold-deep)]">Duración</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[var(--gold-deep)]">Riesgo</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[var(--gold-deep)]">Inicio</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[var(--gold-deep)]">Eventos</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const meta = STATUS_META[s.status] ?? STATUS_META.COMPLETED;
                  const Icon = meta.icon;
                  const liveMs = computeCurrentDurationMs(
                    { status: s.status, accumulatedMs: s.accumulatedMs, lastResumedAt: s.lastResumedAt ?? null },
                    now,
                  );
                  const events = readEvents(s.eventsJson);
                  const bandStyle =
                    s.riskBand === "HIGH"
                      ? { background: "var(--red-dim)", color: "var(--red)", border: "var(--red-border)" }
                      : s.riskBand === "MEDIUM"
                      ? { background: "var(--amber-dim)", color: "var(--amber)", border: "var(--amber-border)" }
                      : { background: "var(--green-dim)", color: "var(--green)", border: "var(--green-border)" };
                  return (
                    <tr
                      key={s.id}
                      className="transition-colors hover:bg-[var(--row-hover)]"
                      style={{ borderBottom: "1px solid var(--border-subtle)" }}
                    >
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                          style={{ background: meta.bg, color: meta.color, borderColor: meta.border }}
                        >
                          <Icon className="w-3 h-3" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--text)] font-medium">{s.lawyer.fullName}</td>
                      <td className="px-4 py-3 text-sm">
                        <Link
                          href={`/admin/casos/${s.case.id}`}
                          className="font-mono font-semibold text-[var(--text)] hover:text-[var(--gold-deep)] transition-colors"
                        >
                          {s.case.code}
                        </Link>
                        <div className="text-[11px] text-[var(--text-muted)]">{s.case.client.fullName}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-sm font-semibold text-[var(--text)]">{fmt(liveMs)}</div>
                        <div className="text-[10px] text-[var(--text-muted)]">
                          {(liveMs / 60000).toFixed(0)} min
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {s.riskScore !== null && s.riskBand ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                            style={bandStyle}
                          >
                            <ShieldAlert className="w-3 h-3" />
                            {s.riskBand} · {s.riskScore}
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-[var(--text-muted)]">
                        {new Date(s.startedAt).toLocaleString("es-CL")}
                      </td>
                      <td className="px-4 py-3">
                        <details className="text-[11px]">
                          <summary className="cursor-pointer text-[var(--gold-deep)] font-semibold">
                            {events.length} evento{events.length === 1 ? "" : "s"}
                          </summary>
                          <ul className="mt-2 space-y-0.5">
                            {events.slice(-8).reverse().map((e, i) => (
                              <li key={i} className="text-[var(--text-muted)]">
                                <span className="font-mono">{new Date(e.at).toLocaleString("es-CL", { hour: "2-digit", minute: "2-digit" })}</span>
                                {" · "}
                                <span className="font-semibold text-[var(--text-soft)]">{e.kind}</span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
