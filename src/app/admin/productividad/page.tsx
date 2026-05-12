import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { notFound } from "next/navigation";
import { Role, CaseStage } from "@prisma/client";
import Link from "next/link";
import {
  BarChart3, Clock, TrendingUp, Users, AlertTriangle, Brain,
  Download, ChevronRight, Medal, Star, Target, Zap, Shield,
} from "lucide-react";
import { subDays, format } from "date-fns";
import { computeSlaStatus } from "@/lib/productividad/sla";
import { getTeamMetrics, getActivityDistribution, detectStagnantCases, ACTIVITY_LABELS } from "@/lib/productividad/metrics";
import { ProductividadCharts } from "./ProductividadCharts";

export default async function ProductividadPage() {
  const session = await auth();
  if (!session || session.user.role === Role.CLIENTE) return notFound();

  const isManager = session.user.role === Role.SUPER_ADMIN || session.user.role === Role.JEFE_DE_MESA;

  const endDate = new Date();
  const startDate = subDays(endDate, 30);

  const data = await withRls(async (tx) => {
    const activeCases = await tx.case.findMany({
      where: { stage: { notIn: [CaseStage.FINISHED] } },
      include: {
        categoria: { include: { slaDefinition: true } },
        abogados: { select: { id: true, fullName: true } },
        timeEntries: { orderBy: { date: "desc" }, take: 1 },
        aiAnalyses: { orderBy: { analyzedAt: "desc" }, take: 1 },
      },
    });

    const recentEntries = await tx.timeEntry.findMany({
      where: { date: { gte: startDate } },
      include: {
        lawyer: { select: { fullName: true } },
        case: { select: { code: true } },
      },
      orderBy: { date: "desc" },
      take: 8,
    });

    const totalMinutesResult = await tx.timeEntry.aggregate({
      where: { date: { gte: startDate } },
      _sum: { durationMinutes: true },
    });

    const aiAlerts = await tx.aiCaseAnalysis.findMany({
      where: {
        riskLevel: { in: ["ALTO", "CRITICO"] },
        analyzedAt: { gte: subDays(new Date(), 7) },
      },
      include: { case: { select: { id: true, code: true } } },
      orderBy: { healthScore: "asc" },
      take: 5,
    });

    return { activeCases, recentEntries, totalMinutesResult, aiAlerts };
  });

  // SLA statistics
  let slaTotal = 0, slaCumplido = 0, slaRiesgo = 0;
  const slaByCategory: Record<string, { cumplido: number; en_riesgo: number; incumplido: number; name: string }> = {};

  for (const c of data.activeCases) {
    const slaDef = c.categoria?.slaDefinition;
    if (!slaDef?.active) continue;
    slaTotal++;
    const result = computeSlaStatus(
      { createdAt: c.createdAt, stage: c.stage, halted_at: c.halted_at, resolvedAt: c.resolvedAt },
      slaDef.maxDays
    );
    const catName = c.categoria?.name ?? "Sin categoría";
    if (!slaByCategory[catName]) slaByCategory[catName] = { cumplido: 0, en_riesgo: 0, incumplido: 0, name: catName };
    if (result.status === "CUMPLIDO") { slaCumplido++; slaByCategory[catName].cumplido++; }
    else if (result.status === "EN_RIESGO") { slaRiesgo++; slaByCategory[catName].en_riesgo++; }
    else if (result.status === "INCUMPLIDO") { slaByCategory[catName].incumplido++; }
  }

  const slaCompliancePct = slaTotal > 0 ? Math.round((slaCumplido / slaTotal) * 100) : 0;
  const totalHours = ((data.totalMinutesResult._sum.durationMinutes ?? 0) / 60);
  const stagnantCases = await detectStagnantCases();
  const teamMetrics = isManager ? await getTeamMetrics(startDate, endDate) : [];
  const activityDistribution = await getActivityDistribution(startDate, endDate);

  const slaChartData = Object.values(slaByCategory);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* ── HEADER ── */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-md" style={{ background: "var(--surface-2)" }}>
              <BarChart3 className="w-5 h-5" style={{ color: "var(--gold)" }} />
            </div>
            <h1
              className="text-3xl font-bold tracking-tight text-[var(--text)]"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Control de Gestión
            </h1>
          </div>
          <p className="text-sm font-medium ml-11" style={{ color: "var(--text-muted)" }}>
            Productividad, SLAs y análisis de IA — Últimos 30 días
          </p>
        </div>
        {isManager && (
          <div className="flex items-center gap-3">
            <a
              href="/api/productividad/export?period=30"
              className="flex items-center gap-2 px-4 py-2 rounded-md text-[11px] font-bold uppercase tracking-widest border transition-colors hover:bg-[var(--surface)]"
              style={{ borderColor: "var(--border-glass)", color: "var(--text-muted)" }}
            >
              <Download className="w-3.5 h-3.5" />
              Exportar Excel
            </a>
            <Link
              href="/admin/productividad/ia"
              className="flex items-center gap-2 px-4 py-2.5 rounded-md text-[11px] font-bold uppercase tracking-widest text-[var(--text)] transition-colors"
              style={{ background: "var(--bg)" }}
            >
              <Brain className="w-3.5 h-3.5" />
              Analizar con IA
            </Link>
          </div>
        )}
      </header>

      {/* ── KPI HERO BAR ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <HeroKpi
          icon={Shield}
          label="SLA Global"
          value={`${slaCompliancePct}%`}
          sub={`${slaCumplido}/${slaTotal} expedientes`}
          tone={slaCompliancePct >= 80 ? "ok" : slaCompliancePct >= 60 ? "warn" : "bad"}
        />
        <HeroKpi
          icon={AlertTriangle}
          label="En riesgo"
          value={slaRiesgo.toString()}
          sub="SLA próximo a vencer"
          tone={slaRiesgo > 0 ? "warn" : "ok"}
        />
        <HeroKpi
          icon={Clock}
          label="Horas Equipo"
          value={`${totalHours.toFixed(0)}h`}
          sub="Últimos 30 días"
          tone="neutral"
        />
        <HeroKpi
          icon={Users}
          label="Casos Activos"
          value={data.activeCases.filter(c => c.stage !== CaseStage.HALTED_BY_PAYMENT).length.toString()}
          sub={`${stagnantCases.length} estancados`}
          tone={stagnantCases.length > 2 ? "warn" : "ok"}
        />
        <HeroKpi
          icon={TrendingUp}
          label="Score IA Prom."
          value={
            data.aiAlerts.length > 0
              ? `${Math.round(data.aiAlerts.reduce((a, x) => a + x.healthScore, 0) / data.aiAlerts.length)}/100`
              : "—"
          }
          sub="Últimas alertas IA"
          tone="neutral"
        />
      </div>

      {/* ── MAIN GRID ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left 2/3: Charts */}
        <div className="xl:col-span-2 space-y-6">
          <ProductividadCharts
            slaChartData={slaChartData}
            activityData={activityDistribution}
            teamMetrics={teamMetrics}
            isManager={isManager}
          />
        </div>

        {/* Right 1/3: Alerts + Actions */}
        <div className="space-y-6">
          {/* AI Alerts */}
          {data.aiAlerts.length > 0 && (
            <SectionCard title="Alertas de IA" icon={Brain} badge={data.aiAlerts.length}>
              <div className="space-y-2">
                {data.aiAlerts.map((a) => (
                  <Link
                    key={a.id}
                    href={`/admin/casos/${a.case.id}`}
                    className="flex items-center gap-3 p-3 rounded-md border transition-all hover:border-[var(--gold)40] hover:bg-[var(--surface-2)]"
                    style={{ borderColor: "var(--border-glass)" }}
                  >
                    <RiskDot level={a.riskLevel} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-[var(--text)] truncate">{a.case.code}</div>
                      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        Score: {a.healthScore}/100 · {riskLabel(a.riskLevel)}
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
                  </Link>
                ))}
              </div>
              <Link href="/admin/productividad/ia" className="block text-center text-[11px] font-bold mt-2" style={{ color: "var(--gold)" }}>
                Ver análisis completo →
              </Link>
            </SectionCard>
          )}

          {/* Stagnant cases */}
          {stagnantCases.length > 0 && (
            <SectionCard title="Casos Estancados" icon={AlertTriangle} badge={stagnantCases.length} tone="warn">
              <div className="space-y-2">
                {stagnantCases.slice(0, 4).map((c) => (
                  <Link
                    key={c.caseId}
                    href={`/admin/casos/${c.caseId}`}
                    className="flex items-center gap-3 p-3 rounded-md border transition-all hover:border-[#FCD34D40] hover:bg-[rgba(245, 158, 11, 0.1)]"
                    style={{ borderColor: "var(--border-glass)" }}
                  >
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#FCD34D" }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-[var(--text)] truncate">{c.code}</div>
                      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {c.daysSinceActivity}d sin actividad · {c.category}
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
                  </Link>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Quick links */}
          <SectionCard title="Accesos Rápidos" icon={Zap}>
            <div className="space-y-1">
              {[
                { href: "/admin/productividad/sla", label: "Gestión de SLAs", icon: Shield },
                { href: "/admin/productividad/horas", label: "Registro de Horas", icon: Clock },
                { href: "/admin/productividad/ranking", label: "Ranking de Equipo", icon: Medal },
                { href: "/admin/productividad/ia", label: "Análisis de IA", icon: Brain },
              ].map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all hover:bg-[var(--surface-2)]"
                  style={{ color: "var(--text)" }}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" style={{ color: "var(--gold)" }} />
                  <span className="font-medium">{label}</span>
                  <ChevronRight className="w-3.5 h-3.5 ml-auto" style={{ color: "var(--border-glass)" }} />
                </Link>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ── TEAM RANKING (managers only) ── */}
      {isManager && teamMetrics.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--border-glass)] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md" style={{ background: "var(--surface-2)" }}>
                <Target className="w-4 h-4" style={{ color: "var(--gold)" }} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[var(--text)]">Ranking de Productividad</h2>
                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Últimos 30 días · Ordenado por score compuesto</p>
              </div>
            </div>
            <Link href="/admin/productividad/ranking" className="text-[11px] font-bold" style={{ color: "var(--gold)" }}>
              Ver completo →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--surface-2)" }}>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--gold)" }}>#</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--gold)" }}>Abogado</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--gold)" }}>Casos</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--gold)" }}>Horas</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--gold)" }}>Tasa Éxito</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--gold)" }}>Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-glass)]">
                {teamMetrics.slice(0, 6).map((m, i) => (
                  <tr key={m.lawyerId} className="hover:bg-[var(--surface-2)] transition-colors">
                    <td className="px-4 py-3">
                      {i < 3 ? (
                        <span className="flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold" style={{ background: i === 0 ? "var(--gold)" : i === 1 ? "#C0C0C0" : "#CD7F32", color: i === 0 ? "var(--bg)" : "white" }}>
                          {i + 1}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)] font-medium">{i + 1}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[var(--text)]">{m.fullName}</div>
                      {i < 3 && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Star className="w-3 h-3" style={{ color: "var(--gold)", fill: "var(--gold)" }} />
                          <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--gold)" }}>Top Performer</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-[var(--text)]">{m.casesFinished}/{m.casesAssigned}</td>
                    <td className="px-4 py-3 text-right font-medium text-[var(--text)]">{(m.totalMinutes / 60).toFixed(0)}h</td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className="font-bold"
                        style={{ color: m.successRate >= 0.7 ? "#4ADE80" : m.successRate >= 0.5 ? "#FCD34D" : "var(--red)" }}
                      >
                        {Math.round(m.successRate * 100)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold text-[var(--text)]">{Math.round(m.compositeScore)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── RECENT TIME ENTRIES ── */}
      <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border-glass)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md" style={{ background: "var(--surface-2)" }}>
              <Clock className="w-4 h-4" style={{ color: "var(--gold)" }} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--text)]">Últimos Registros de Horas</h2>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Actividad reciente del equipo</p>
            </div>
          </div>
          <Link href="/admin/productividad/horas" className="text-[11px] font-bold" style={{ color: "var(--gold)" }}>
            Ver todos →
          </Link>
        </div>
        {data.recentEntries.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm italic" style={{ color: "var(--text-muted)" }}>
            No hay registros de horas aún. Empieza registrando tiempo desde la vista de cada expediente.
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-glass)]">
            {data.recentEntries.map((e) => (
              <div key={e.id} className="px-6 py-3 flex items-center gap-4 hover:bg-[var(--surface-2)] transition-colors">
                <div className="text-[10px] font-mono text-[var(--text-muted)] w-20 flex-shrink-0">
                  {format(new Date(e.date), "dd/MM")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-[var(--text)]">{e.case.code}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">{e.lawyer.fullName} · {ACTIVITY_LABELS[e.category]}</div>
                </div>
                <div className="text-sm font-bold flex-shrink-0" style={{ color: "var(--gold)" }}>
                  {(e.durationMinutes / 60).toFixed(1)}h
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HeroKpi({ icon: Icon, label, value, sub, tone }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string; value: string; sub: string;
  tone: "ok" | "warn" | "bad" | "neutral";
}) {
  const colors = {
    ok: { text: "#4ADE80", bg: "rgba(34, 197, 94, 0.1)" },
    warn: { text: "#FCD34D", bg: "rgba(245, 158, 11, 0.1)" },
    bad: { text: "var(--red)", bg: "rgba(220, 38, 38, 0.1)" },
    neutral: { text: "var(--gold)", bg: "var(--surface-2)" },
  }[tone];
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md p-5 shadow-sm hover:shadow-md transition-all">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded" style={{ background: colors.bg }}>
          <Icon className="w-4 h-4" style={{ color: colors.text }} />
        </div>
        <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{label}</span>
      </div>
      <div className="text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>{value}</div>
      <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>{sub}</p>
    </div>
  );
}

function SectionCard({ title, icon: Icon, badge, tone, children }: {
  title: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  badge?: number;
  tone?: "warn";
  children: React.ReactNode;
}) {
  const accentColor = tone === "warn" ? "#FCD34D" : "var(--gold)";
  const accentBg = tone === "warn" ? "rgba(245, 158, 11, 0.1)" : "var(--surface-2)";
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border-glass)] flex items-center gap-2">
        <div className="p-1.5 rounded" style={{ background: accentBg }}>
          <Icon className="w-3.5 h-3.5" style={{ color: accentColor }} />
        </div>
        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--text)" }}>{title}</span>
        {badge !== undefined && badge > 0 && (
          <span
            className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: tone === "warn" ? "rgba(245, 158, 11, 0.1)" : "var(--surface-2)", color: accentColor }}
          >
            {badge}
          </span>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function RiskDot({ level }: { level: string }) {
  const colors: Record<string, string> = {
    BAJO: "#4ADE80", MEDIO: "#FCD34D", ALTO: "#FBBF24", CRITICO: "var(--red)",
  };
  return <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colors[level] ?? "var(--text-muted)" }} />;
}

function riskLabel(level: string): string {
  const map: Record<string, string> = { BAJO: "Bajo", MEDIO: "Medio", ALTO: "Alto", CRITICO: "Crítico" };
  return map[level] ?? level;
}
