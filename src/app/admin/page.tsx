import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { CaseStage } from "@prisma/client";
import { DashboardStats } from "@/components/DashboardStats";
import { RecentActivity } from "@/components/RecentActivity";
import { StatsChart } from "@/components/StatsChart";

export default async function AdminDashboard() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role === "CLIENTE") redirect("/portal");

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const stats = await withRls(async (tx) => {
    const [totalCases, activeCases, pendingCases, completedToday, activeUsers] = await Promise.all([
      tx.case.count(),
      tx.case.count({
        where: { stage: { in: [CaseStage.IN_PROGRESS, CaseStage.OPEN] } },
      }),
      tx.case.count({
        where: { stage: CaseStage.OPEN },
      }),
      tx.case.count({
        where: {
          stage: CaseStage.FINISHED,
          resolvedAt: { gte: todayStart },
        },
      }),
      tx.user.count({
        where: {
          role: { not: "CLIENTE" },
          lastSeenAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
        },
      }),
    ]);

    return { totalCases, activeCases, pendingCases, completedToday, totalPayments: 0, activeUsers };
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--text)" }}>
          Bienvenido, {session.user.name}
        </h1>
        <p className="text-base" style={{ color: "var(--text-muted)" }}>
          Resumen de actividad y estado del sistema legal
        </p>
      </div>

      <DashboardStats stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StatsChart />
        <RecentActivity />
      </div>

      <div
        className="rounded-xl p-6"
        style={{
          background: "linear-gradient(135deg, var(--gold) 0%, var(--lemon-soft) 100%)",
          border: "1px solid var(--border-glass)",
        }}
      >
        <h2 className="text-xl font-bold mb-4" style={{ color: "#050606" }}>
          Acciones Rápidas
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { href: "/admin/casos/nuevo", title: "Crear Nuevo Caso", desc: "Registrar un nuevo expediente" },
            { href: "/admin/bandeja", title: "Ver Bandeja", desc: "Casos pendientes de asignación" },
            ...(session.user.role === "SUPER_ADMIN" ? [
              { href: "/admin/metricas", title: "Ver Métricas", desc: "Rendimiento operativo" },
              { href: "/admin/productividad", title: "Control de Gestión", desc: "SLAs, horas y análisis IA" },
            ] : []),
          ].map(({ href, title, desc }) => (
            <a
              key={href}
              href={href}
              className="bg-[var(--surface)] rounded-lg p-4 hover:shadow-lg transition-all duration-200 hover:-translate-y-1"
            >
              <h3 className="font-semibold mb-1" style={{ color: "var(--text)" }}>{title}</h3>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>{desc}</p>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
