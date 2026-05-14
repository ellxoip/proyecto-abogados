import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BriefcaseBusiness, LayoutDashboard, Sparkles, TrendingUp } from "lucide-react";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { CaseStage } from "@/lib/db-enums";
import { DashboardStats } from "@/components/DashboardStats";
import { RecentActivity } from "@/components/RecentActivity";
import { StatsChart } from "@/components/StatsChart";

export default async function AdminDashboard() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role === "CLIENTE") redirect("/portal");

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { stats, drilldown, activity } = await withRls(async (tx) => {
    const include = {
      client: { select: { fullName: true } },
      categoria: { select: { name: true } },
    } as const;

    const [
      totalCases,
      activeCases,
      pendingCases,
      completedToday,
      activeUsers,
      recentCases,
      topActiveCases,
      topPendingCases,
      topCompletedTodayCases,
      onlineUsers,
    ] = await Promise.all([
      tx.case.count(),
      tx.case.count({ where: { stage: { in: [CaseStage.IN_PROGRESS, CaseStage.OPEN] } } }),
      tx.case.count({ where: { stage: CaseStage.OPEN } }),
      tx.case.count({ where: { stage: CaseStage.FINISHED, resolvedAt: { gte: todayStart } } }),
      tx.user.count({
        where: { role: { not: "CLIENTE" }, lastSeenAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } },
      }),
      tx.case.findMany({ include, orderBy: { createdAt: "desc" }, take: 5 }),
      tx.case.findMany({
        where: { stage: { in: [CaseStage.IN_PROGRESS, CaseStage.OPEN] } },
        include,
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      tx.case.findMany({
        where: { stage: CaseStage.OPEN },
        include,
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      tx.case.findMany({
        where: { stage: CaseStage.FINISHED, resolvedAt: { gte: todayStart } },
        include,
        orderBy: { resolvedAt: "desc" },
        take: 5,
      }),
      tx.user.findMany({
        where: { role: { not: "CLIENTE" }, lastSeenAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } },
        select: { id: true, fullName: true, role: true, lastSeenAt: true },
        orderBy: { lastSeenAt: "desc" },
        take: 5,
      }),
    ]);

    // Recent activity feed — last 8 meaningful audit log entries
    const recentAudits = await tx.auditLog.findMany({
      where: {
        action: {
          in: [
            "CASE_ASSIGNED",
            "CASE_DERIVED",
            "CASE_FINISHED",
            "CASE_HALTED",
            "CASE_REACTIVATED",
            "PAYMENT_RECORDED",
            "TIME_ENTRY_LOGGED",
            "TIME_ENTRY_FLAGGED",
            "TIMER_STARTED",
            "TIMER_ENTRY_LOGGED",
            "TIMER_ENTRY_FLAGGED",
            "DATA_EXPORTED",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    });

    const actorIds = Array.from(new Set(recentAudits.map((a) => a.actorId).filter(Boolean))) as string[];
    const caseIds = Array.from(new Set(recentAudits.map((a) => a.caseId).filter(Boolean))) as string[];
    const [actors, cases] = await Promise.all([
      actorIds.length
        ? tx.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true, role: true } })
        : Promise.resolve([]),
      caseIds.length
        ? tx.case.findMany({ where: { id: { in: caseIds } }, select: { id: true, code: true } })
        : Promise.resolve([]),
    ]);
    const actorById = new Map(actors.map((a) => [a.id, a]));
    const caseById = new Map(cases.map((c) => [c.id, c]));

    const activity = recentAudits.map((a) => ({
      id: a.id,
      action: a.action,
      message: a.message,
      metadata: a.metadata,
      status: a.status,
      template: a.template,
      channel: a.channel,
      createdAt: a.createdAt.toISOString(),
      caseId: a.caseId,
      caseCode: a.caseId ? caseById.get(a.caseId)?.code ?? null : null,
      actorId: a.actorId,
      actorName: a.actorId ? actorById.get(a.actorId)?.fullName ?? null : null,
      actorRole: a.actorId ? actorById.get(a.actorId)?.role ?? null : null,
    }));

    const serialize = (c: typeof recentCases[number]) => ({
      id: c.id,
      code: c.code,
      stage: c.stage,
      clientName: c.client.fullName,
      categoryName: c.categoria?.name ?? null,
      updatedAt: c.updatedAt.toISOString(),
      resolvedAt: c.resolvedAt?.toISOString() ?? null,
    });

    return {
      stats: { totalCases, activeCases, pendingCases, completedToday, totalPayments: 0, activeUsers },
      drilldown: {
        total: recentCases.map(serialize),
        active: topActiveCases.map(serialize),
        pending: topPendingCases.map(serialize),
        completedToday: topCompletedTodayCases.map(serialize),
        onlineUsers: onlineUsers.map((u) => ({
          id: u.id,
          name: u.fullName,
          role: u.role,
          lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
        })),
      },
      activity,
    };
  });

  const quickActions = [
    { href: "/admin/casos/nuevo", title: "Crear nuevo caso", desc: "Registrar un expediente desde cero", icon: BriefcaseBusiness },
    { href: "/admin/bandeja", title: "Abrir bandeja", desc: "Revisar asignaciones y pendientes", icon: LayoutDashboard },
    { href: "/admin/metricas", title: "Ver métricas", desc: "Rendimiento y operación", icon: TrendingUp },
    { href: "/admin/productividad", title: "Control de gestión", desc: "SLAs, horas y análisis IA", icon: Sparkles },
  ];

  return (
    <div className="space-y-8">
      <section
        className="relative overflow-hidden rounded-[28px] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.16)] sm:p-8"
        style={{
          background: "linear-gradient(135deg, var(--sidebar-bg) 0%, #2E2B6A 100%)",
          border: "1px solid var(--sidebar-border)",
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.10),transparent_36%),radial-gradient(circle_at_left,rgba(201,168,76,0.18),transparent_28%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-white" />
              Hive Control · Command Center
            </div>
            <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Bienvenido, {session.user.name}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white sm:text-base">
              Resumen operativo con foco en seguimiento, carga de trabajo y actividad crítica del sistema legal.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[420px]">
            {[
              { label: "Casos", value: stats.totalCases },
              { label: "Activos", value: stats.activeCases },
              { label: "Pendientes", value: stats.pendingCases },
              { label: "Hoy", value: stats.completedToday },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/20 bg-black/25 px-4 py-3 backdrop-blur-md">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white">{item.label}</div>
                <div className="mt-2 text-2xl font-bold text-white">{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative mt-6 flex flex-wrap gap-2">
          <Link href="/admin/casos/nuevo" className="btn-primary px-4 py-3 text-[11px]">
            Nuevo caso
          </Link>
          <Link href="/admin/bandeja" className="btn-secondary px-4 py-3 text-[11px]">
            Bandeja
          </Link>
          <Link href="/admin/mensajeria" className="btn-dark px-4 py-3 text-[11px]">
            Mensajería
          </Link>
        </div>
      </section>

      <DashboardStats stats={stats} drilldown={drilldown} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <StatsChart />
        <RecentActivity activities={activity} />
      </div>

      <section className="rounded-[28px] border border-[var(--border-glass)] bg-[linear-gradient(180deg,#fbfcff_0%,#f6f8fc_100%)] p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)] sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--text-muted)]">Acciones rápidas</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-[var(--text)]">Flujos principales del equipo</h2>
          </div>
          <Link href="/admin/metricas" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--gold-deep)]">
            Ir a métricas
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {quickActions.map(({ href, title, desc, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-[22px] border border-[var(--border-glass)] bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--gold-border)] hover:shadow-[0_16px_34px_rgba(15,23,42,0.08)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="max-w-[calc(100%-1.5rem)]">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-[linear-gradient(180deg,var(--bg) 0%,var(--bg-deep) 100%)] text-white shadow-sm">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-[var(--text)]">{title}</h3>
                  <p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">{desc}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-[var(--text-muted)] opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
