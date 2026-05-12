import { withRls } from "@/lib/rls";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import { Role, CaseStage, Satisfaction } from "@prisma/client";
import { 
  Scale, Users, TrendingUp, Clock, AlertCircle
} from "lucide-react";

// This is a Server Component, but Recharts needs Client Components for interactivity.
// I'll create a nested client component for the charts.
import { AnalyticsCharts } from "./AnalyticsCharts";

export default async function MetricsPage() {
  const session = await auth();
  if (!session || session.user.role === Role.CLIENTE) return notFound();

  // Fetch data for the dashboard
  const data = await withRls(async (tx) => {
    const allCases = await tx.case.findMany({
      include: { categoria: true }

    });

    const categories = await tx.category.findMany({ orderBy: { name: "asc" } });

    return { allCases, categories };
  });

  const { allCases, categories } = data;

  // Process Stats
  const total = allCases.length;
  const finished = allCases.filter(c => c.stage === CaseStage.FINISHED).length;
  const inMora = allCases.filter(c => c.stage === CaseStage.HALTED_BY_PAYMENT).length;

  const satisfactionStats = {
    happy: allCases.filter(c => c.satisfaction === Satisfaction.HAPPY).length,
    neutral: allCases.filter(c => c.satisfaction === Satisfaction.NEUTRAL).length,
    sad: allCases.filter(c => c.satisfaction === Satisfaction.SAD).length,
  };

  // Preparation for charts
  const categoryData = categories.map(cat => ({
    name: cat.name,
    count: allCases.filter(c => c.categoryId === cat.id).length
  })).sort((a, b) => b.count - a.count);

  // ── Trend: last 7 days (rolling) ───────────────────────────────
  const dayLabels = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
  const now = new Date();
  const trendData = [] as { name: string; casos: number; cierres: number }[];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const casos = allCases.filter(c => c.createdAt >= dayStart && c.createdAt <= dayEnd).length;
    const cierres = allCases.filter(c =>
      c.stage === CaseStage.FINISHED && c.resolvedAt && c.resolvedAt >= dayStart && c.resolvedAt <= dayEnd
    ).length;

    trendData.push({ name: dayLabels[dayStart.getDay()], casos, cierres });
  }

  // ── Insights: month-over-month effectiveness ───────────────────
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  const currRevenue = allCases.filter(c => c.createdAt >= currentMonthStart).length;
  const currClosures = allCases.filter(c =>
    c.stage === CaseStage.FINISHED && c.resolvedAt && c.resolvedAt >= currentMonthStart
  ).length;
  const currEffectiveness = currRevenue > 0 ? currClosures / currRevenue : 0;

  const prevRevenue = allCases.filter(c =>
    c.createdAt >= previousMonthStart && c.createdAt <= previousMonthEnd
  ).length;
  const prevClosures = allCases.filter(c =>
    c.stage === CaseStage.FINISHED && c.resolvedAt &&
    c.resolvedAt >= previousMonthStart && c.resolvedAt <= previousMonthEnd
  ).length;
  const prevEffectiveness = prevRevenue > 0 ? prevClosures / prevRevenue : 0;

  let insightSentence: string;
  if (prevEffectiveness === 0 && currEffectiveness === 0) {
    insightSentence = "Aún no hay datos suficientes para comparar la efectividad mensual.";
  } else if (prevEffectiveness === 0) {
    insightSentence = `La efectividad del mes actual se sitúa en ${Math.round(currEffectiveness * 100)}%, sin base comparable del mes anterior.`;
  } else {
    const deltaPct = ((currEffectiveness - prevEffectiveness) / prevEffectiveness) * 100;
    const direction = deltaPct >= 0 ? "incrementado" : "disminuido";
    insightSentence = `La efectividad del despacho ha ${direction} un ${Math.abs(Math.round(deltaPct))}% respecto al mes anterior.`;
  }

  const topCategoryName = categoryData[0]?.count ? categoryData[0].name : null;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text)]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Métricas de Operación Legal
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1 font-medium">Control estratégico de efectividad, plazos y satisfacción.</p>
        </div>
        <div className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border-glass)] px-4 py-2 rounded-md shadow-sm">
          <Clock className="w-4 h-4 text-[var(--gold)]" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text)]">Periodo: Últimos 30 días</span>
        </div>
      </header>

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Scale} label="Total Expedientes" value={total.toString()} sub="Acumulado histórico" />
        <KpiCard icon={TrendingUp} label="Eficiencia Cierre" value={`${Math.round((finished / (total || 1)) * 100)}%`} sub={`${finished} casos concluidos`} tone="ok" />
        <KpiCard icon={AlertCircle} label="Riesgo Operativo" value={inMora.toString()} sub="Casos en mora activa" tone="warn" />
        <KpiCard icon={Users} label="Satisfacción" value={`${Math.round((satisfactionStats.happy / (total || 1)) * 100)}%`} sub="Índice de felicidad" />
      </div>

      {/* Charts Section */}
      <AnalyticsCharts
        categoryData={categoryData}
        satisfaction={satisfactionStats}
        trendData={trendData}
      />

      {/* Footer / Insights */}
      <div className="bg-[var(--bg)] rounded-lg p-8 text-[var(--gold)] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--gold)] opacity-5 blur-[100px]" />
        <div className="relative z-10">
          <h3 className="text-xl font-bold font-serif mb-2">Insight Estratégico</h3>
          <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
            {insightSentence}
            {topCategoryName && (
              <> La mayor concentración de casos se encuentra en la categoría <strong>{topCategoryName}</strong>.</>
            )}
            {inMora > 0 && (
              <> Se recomienda atención inmediata a los {inMora} casos en mora para mantener el índice de satisfacción.</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, tone }: any) {
  const color = tone === "ok" ? "text-emerald-600" : tone === "warn" ? "text-red-600" : "text-[var(--gold)]";
  const bg = tone === "ok" ? "bg-emerald-50" : tone === "warn" ? "bg-[rgba(239,68,68,0.1)]" : "bg-[var(--surface-2)]";

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md p-6 shadow-sm hover:shadow-md transition-all">
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded ${bg}`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{label}</span>
      </div>
      <div className="text-3xl font-bold text-[var(--text)] tracking-tight">{value}</div>
      <p className="text-[11px] text-[var(--text-muted)] mt-1 font-medium">{sub}</p>
    </div>
  );
}
