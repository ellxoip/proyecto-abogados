import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { CaseStage, Role, PaymentStatus } from "@/lib/db-enums";
import { fetchWarningSummariesByRut, type WarningLevel } from "@/lib/financial-warnings";
import {
  TrendingDown,
  Clock,
  ShieldAlert,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Bell,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { MoraActions } from "./MoraActions";
import { EmptyState } from "@/components/EmptyState";
import { HelpTip } from "@/components/HelpTip";

type MoraSearchParams = { sort?: string; severity?: "all" | "w10" | "w20" | "w30" };

export default async function MoraDashboardPage({
  searchParams,
}: {
  searchParams: MoraSearchParams | Promise<MoraSearchParams>;
}) {
  // Next 15+ entrega searchParams como Promise. Defensivo para ambas formas.
  const params = (await Promise.resolve(searchParams)) as MoraSearchParams;
  const session = await auth();
  if (session?.user.role !== Role.SUPER_ADMIN) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <EmptyState
          icon={ShieldAlert}
          title="Acceso restringido"
          description="Solo el SuperAdmin puede gestionar la morosidad global de la firma. Si crees que necesitas acceso, contacta al administrador del sistema."
          size="lg"
        />
      </div>
    );
  }

  const severityFilter = params.severity ?? "all";

  const baseData = await withRls(async (tx) => {
    const cases = await tx.case.findMany({
      where: {
        OR: [
          { stage: CaseStage.HALTED_BY_PAYMENT },
          { stage: CaseStage.WAITING_CUOTAS },
          { is_paid: false },
        ],
      },
      include: {
        client: { select: { fullName: true, phone: true, rut: true } },
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
        warnings: {
          select: { level: true, sent_at: true, createdAt: true, delivery_status: true },
        },
      },
      orderBy:
        params.sort === "client_asc"
          ? { client: { fullName: "asc" } }
          : { updatedAt: "desc" },
    });

    const atRiskSum = await tx.paymentEvent.aggregate({
      _sum: { amount: true },
      where: {
        status: { in: [PaymentStatus.UNPAID, PaymentStatus.OVERDUE] },
        case: { stage: CaseStage.HALTED_BY_PAYMENT },
      },
    });

    return {
      cases,
      atRisk: atRiskSum._sum.amount?.toNumber() ?? 0,
    };
  });

  // Enriquecimiento opcional: financial puede aportar saldo vencido si el
  // caso tiene contrato allí. Si financial está caído, devuelve mapa vacío
  // y el dashboard sigue funcionando con la data local de CaseWarning.
  const financialSummaries = await fetchWarningSummariesByRut(
    baseData.cases.map((c) => c.client.rut),
  );

  // Severidad ordinal para sacar el máximo nivel local emitido por caso.
  const rank = (lvl: string | null) =>
    lvl === "WARNING_30" ? 3 : lvl === "WARNING_20" ? 2 : lvl === "WARNING_10" ? 1 : 0;

  const enrichedCases = baseData.cases.map((c) => {
    const localMax = c.warnings.reduce<string | null>((acc, w) => {
      return rank(w.level) > rank(acc) ? w.level : acc;
    }, null);
    const localCount = c.warnings.length;

    const rutKey = (c.client.rut ?? "").replace(/\./g, "").toLowerCase().trim();
    const financial = rutKey ? financialSummaries.get(rutKey) : undefined;
    const financialMax = (financial?.max_level ?? null) as string | null;
    const financialCount = financial
      ? financial.counts.WARNING_10 + financial.counts.WARNING_20 + financial.counts.WARNING_30
      : 0;

    // Fusión: el nivel mostrado es el MAYOR entre local y financial.
    const mergedLevel =
      rank(financialMax) > rank(localMax) ? financialMax : localMax;

    return {
      ...c,
      warnings_sent: localCount + financialCount,
      max_level: mergedLevel as WarningLevel | null,
      saldo_vencido: financial?.saldo_vencido ?? 0,
      dias_detenido:
        c.halted_at ? Math.floor((Date.now() - c.halted_at.getTime()) / 86_400_000) : 0,
    };
  });

  const cases = enrichedCases;
  const stats = {
    atRisk: baseData.atRisk,
    haltedCount: baseData.cases.filter((c) => c.stage === CaseStage.HALTED_BY_PAYMENT).length,
    waitingCount: baseData.cases.filter((c) => c.stage === CaseStage.WAITING_CUOTAS).length,
    activeWarnings: {
      w10: enrichedCases.filter((c) => c.max_level === "WARNING_10").length,
      w20: enrichedCases.filter((c) => c.max_level === "WARNING_20").length,
      w30: enrichedCases.filter((c) => c.max_level === "WARNING_30").length,
    },
  };

  // Filtro de severidad por nivel real de warning emitido. Fuente: financial.
  const filteredCases = cases.filter((c) => {
    if (severityFilter === "all") return true;
    if (severityFilter === "w30") return c.max_level === "WARNING_30";
    if (severityFilter === "w20") return c.max_level === "WARNING_20";
    if (severityFilter === "w10") return c.max_level === "WARNING_10";
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto">
      <header className="mb-8">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text)] font-serif">
            Gestión de Morosidad
          </h1>
          <HelpTip
            content="Control centralizado de la cartera vencida. Aquí ves los casos detenidos por mora, los que aún no han validado pago inicial, y puedes regularizar pagos o enviar recordatorios."
            side="bottom"
            size="md"
            asInfo
          />
        </div>
        <p className="text-sm text-[var(--text-muted)] mt-1 font-medium">
          Control centralizado de cuentas por cobrar y procesos legales suspendidos.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <StatCard
          icon={TrendingDown}
          label="Cartera Vencida (En Riesgo)"
          value={`$${stats.atRisk.toLocaleString("es-CL")}`}
          sub="Suma total de cuotas vencidas en casos con flujo detenido"
          tone="red"
        />
        <StatCard
          icon={ShieldAlert}
          label="Casos Paralizados"
          value={stats.haltedCount.toString()}
          sub="Requieren regularización para continuar trabajando"
          tone="amber"
        />
        <StatCard
          icon={Clock}
          label="Nuevos sin Pago Inicial"
          value={stats.waitingCount.toString()}
          sub="Pendientes de validación inicial"
          tone="info"
        />
        <StatCard
          icon={Bell}
          label="Warnings activos (W10/W20/W30)"
          value={`${stats.activeWarnings.w10} / ${stats.activeWarnings.w20} / ${stats.activeWarnings.w30}`}
          sub="Casos por nivel actual de aviso emitido. Fuente: hive-financial-control."
          tone="info"
        />
      </div>

      {/* Filtro de severidad por tramo de días detenido */}
      <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)] mr-2">
          Filtro:
        </span>
        {(["all", "w10", "w20", "w30"] as const).map((key) => {
          const active = severityFilter === key;
          const label =
            key === "all"
              ? "Todos"
              : key === "w10"
                ? "W10 — Recordatorio"
                : key === "w20"
                  ? "W20 — Aviso crítico"
                  : "W30 — Corte de servicio";
          return (
            <Link
              key={key}
              href={`?severity=${key}${params.sort ? `&sort=${params.sort}` : ""}`}
              className="px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-widest transition-all"
              style={{
                background: active ? "var(--gold-dim)" : "var(--surface-2)",
                color: active ? "var(--gold-deep)" : "var(--text-muted)",
                border: `1px solid ${active ? "var(--gold-deep)" : "var(--card-border)"}`,
              }}
            >
              {label}
            </Link>
          );
        })}
      </div>

      <div
        className="bg-[var(--surface)] rounded-xl shadow-sm overflow-hidden"
        style={{ border: "1px solid var(--card-border)" }}
      >
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--card-border)" }}
        >
          <h2 className="text-sm font-semibold text-[var(--text)]">Casos con incidencia financiera</h2>
          <span className="text-xs text-[var(--text-muted)]">
            {filteredCases.length} de {cases.length} {cases.length === 1 ? "caso" : "casos"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left border-collapse">
            <thead>
              <tr style={{ background: "var(--surface-3)" }}>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-[var(--gold-deep)] border-b border-[var(--card-border)]">
                  Expediente
                </th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-[var(--gold-deep)] border-b border-[var(--card-border)]">
                  <Link
                    href={`?sort=${params.sort === "client_asc" ? "" : "client_asc"}`}
                    className="flex items-center gap-1 hover:text-[var(--text)] transition-colors"
                    title="Alternar orden alfabético"
                  >
                    Cliente
                    {params.sort === "client_asc" ? (
                      <span className="text-[var(--text)] font-extrabold">↑ A-Z</span>
                    ) : (
                      <span className="opacity-50 font-normal">⇵</span>
                    )}
                  </Link>
                </th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-[var(--gold-deep)] border-b border-[var(--card-border)]">
                  Motivo Suspensión
                </th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-[var(--gold-deep)] border-b border-[var(--card-border)] text-center">
                  Nivel Warning
                </th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-[var(--gold-deep)] border-b border-[var(--card-border)] text-center">
                  Avisos Enviados
                </th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-[var(--gold-deep)] border-b border-[var(--card-border)] text-right">
                  Acciones de Cobranza
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-0">
                    <EmptyState
                      icon={CheckCircle2}
                      title={
                        cases.length === 0
                          ? "Sin morosidad activa"
                          : "Sin casos en este tramo"
                      }
                      description={
                        cases.length === 0
                          ? "No hay casos en mora ni cuentas por cobrar pendientes. La gestión financiera está al día."
                          : "Ningún caso cae en el rango de días seleccionado. Cambia el filtro para ver más casos."
                      }
                      size="lg"
                    />
                  </td>
                </tr>
              ) : (
                filteredCases.map((c) => {
                  const isHalted = c.stage === CaseStage.HALTED_BY_PAYMENT;
                  return (
                    <tr
                      key={c.id}
                      className="transition-colors group"
                      style={{
                        background: isHalted ? "rgba(220, 38, 38, 0.04)" : undefined,
                        borderLeft: isHalted
                          ? "3px solid var(--red)"
                          : "3px solid rgba(217, 119, 6, 0.4)",
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      <td className="px-6 py-4">
                        <Link
                          href={`/admin/casos/${c.id}`}
                          className="font-bold text-[var(--text)] tracking-wider hover:text-[var(--gold-deep)] transition-colors"
                        >
                          {c.code}
                        </Link>
                        <div className="text-[10px] text-[var(--text-muted)] mt-0.5 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {c.halted_at
                            ? `Detenido: ${new Date(c.halted_at).toLocaleDateString("es-CL")}`
                            : `Actualizado: ${new Date(c.updatedAt).toLocaleDateString("es-CL")}`}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-[var(--text)]">
                          {c.client.fullName}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">{c.client.phone}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {isHalted ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-[var(--red)]" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-[var(--amber)]" />
                          )}
                          <span className="text-xs font-medium text-[var(--text)]">
                            {c.halted_reason ||
                              (c.stage === CaseStage.WAITING_CUOTAS
                                ? "Pendiente cuota inicial"
                                : "Pendiente de validación")}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {c.max_level ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold tracking-wider"
                            style={{
                              background:
                                c.max_level === "WARNING_30"
                                  ? "var(--red-dim)"
                                  : c.max_level === "WARNING_20"
                                    ? "var(--amber-dim)"
                                    : "var(--blue-dim)",
                              color:
                                c.max_level === "WARNING_30"
                                  ? "var(--red)"
                                  : c.max_level === "WARNING_20"
                                    ? "var(--amber)"
                                    : "var(--blue)",
                              border: `1px solid ${
                                c.max_level === "WARNING_30"
                                  ? "var(--red-border)"
                                  : c.max_level === "WARNING_20"
                                    ? "var(--amber-border)"
                                    : "var(--blue-border)"
                              }`,
                            }}
                            title={`Mora: ${c.dias_detenido} días${c.saldo_vencido > 0 ? ` · Saldo vencido (financial): $${c.saldo_vencido.toLocaleString("es-CL")}` : ""}`}
                          >
                            {c.max_level === "WARNING_30"
                              ? "W30 — Corte"
                              : c.max_level === "WARNING_20"
                                ? "W20 — Crítico"
                                : "W10 — Aviso"}
                          </span>
                        ) : c.dias_detenido > 0 ? (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]"
                            title={`Próximo aviso automático: W10 en ${Math.max(0, 10 - c.dias_detenido)} días`}
                          >
                            <Clock className="w-3 h-3" />
                            En seguimiento · {c.dias_detenido}d / 10
                          </span>
                        ) : (
                          <span className="text-[11px] text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className="inline-flex items-center gap-1 text-xs font-bold text-[var(--text)]"
                          title="Avisos automáticos enviados al cliente (warnings 10/20/30 días). Fuente: hive-financial-control."
                        >
                          <Bell className="w-3 h-3 text-[var(--gold-deep)]" />
                          {c.warnings_sent}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2 relative">
                          {c.payments[0]?.receipt_url && (
                            <a
                              href={c.payments[0].receipt_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all"
                              style={{
                                background: "var(--blue-dim)",
                                color: "var(--blue)",
                                border: "1px solid var(--blue-border)",
                              }}
                              title="Ver comprobante subido por el cliente"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Comprobante
                            </a>
                          )}
                          <MoraActions
                            caseId={c.id}
                            caseCode={c.code}
                            clientName={c.client.fullName}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  tone: "red" | "amber" | "info";
}) {
  const styles = {
    red: { bg: "var(--red-dim)", color: "var(--red)", border: "var(--red-border)" },
    amber: { bg: "var(--amber-dim)", color: "var(--amber)", border: "var(--amber-border)" },
    info: { bg: "var(--blue-dim)", color: "var(--blue)", border: "var(--blue-border)" },
  }[tone];

  return (
    <div
      className="rounded-xl p-6 transition-shadow hover:shadow-md"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--card-border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div
          className="p-2.5 rounded-lg"
          style={{ background: styles.bg, border: `1px solid ${styles.border}` }}
        >
          <Icon className="w-5 h-5" style={{ color: styles.color }} />
        </div>
      </div>
      <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">
        {label}
      </div>
      <div className="text-3xl font-bold text-[var(--text)]" style={{ letterSpacing: "-0.02em" }}>
        {value}
      </div>
      <p className="text-[11px] text-[var(--text-muted)] mt-3 leading-relaxed">{sub}</p>
    </div>
  );
}
