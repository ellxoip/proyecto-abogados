import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { CaseStage, Role, PaymentStatus } from "@/lib/db-enums";
import {
  TrendingDown,
  Clock,
  ShieldAlert,
  FileText,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { MoraActions } from "./MoraActions";
import { EmptyState } from "@/components/EmptyState";
import { HelpTip } from "@/components/HelpTip";

export default async function MoraDashboardPage({
  searchParams,
}: {
  searchParams: { sort?: string };
}) {
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

  const { cases, stats } = await withRls(async (tx) => {
    const cases = await tx.case.findMany({
      where: {
        OR: [
          { stage: CaseStage.HALTED_BY_PAYMENT },
          { stage: CaseStage.WAITING_CUOTAS },
          { is_paid: false },
        ],
      },
      include: {
        client: { select: { fullName: true, phone: true } },
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy:
        searchParams.sort === "client_asc"
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
      stats: {
        atRisk: atRiskSum._sum.amount?.toNumber() ?? 0,
        haltedCount: cases.filter((c) => c.stage === CaseStage.HALTED_BY_PAYMENT).length,
        waitingCount: cases.filter((c) => c.stage === CaseStage.WAITING_CUOTAS).length,
      },
    };
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
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
            {cases.length} {cases.length === 1 ? "caso" : "casos"}
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
                    href={`?sort=${searchParams.sort === "client_asc" ? "" : "client_asc"}`}
                    className="flex items-center gap-1 hover:text-[var(--text)] transition-colors"
                    title="Alternar orden alfabético"
                  >
                    Cliente
                    {searchParams.sort === "client_asc" ? (
                      <span className="text-[var(--text)] font-extrabold">↑ A-Z</span>
                    ) : (
                      <span className="opacity-50 font-normal">⇵</span>
                    )}
                  </Link>
                </th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-[var(--gold-deep)] border-b border-[var(--card-border)]">
                  Motivo Suspensión
                </th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-[var(--gold-deep)] border-b border-[var(--card-border)] text-right">
                  Acciones de Cobranza
                </th>
              </tr>
            </thead>
            <tbody>
              {cases.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-0">
                    <EmptyState
                      icon={CheckCircle2}
                      title="Sin morosidad activa"
                      description="No hay casos en mora ni cuentas por cobrar pendientes. La gestión financiera está al día."
                      size="lg"
                    />
                  </td>
                </tr>
              ) : (
                cases.map((c) => {
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
