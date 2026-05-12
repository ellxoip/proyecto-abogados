"use client";

import {
  TrendingUp,
  TrendingDown,
  Folder,
  Users,
  Clock,
  CheckCircle,
  DollarSign,
  Activity
} from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  subtitle?: string;
}

function StatCard({ title, value, change, icon, color, bgColor, subtitle }: StatCardProps) {
  const isPositive = change !== undefined && change >= 0;

  return (
    <div
      className="rounded-xl p-6 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 cursor-pointer"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-glass)"
      }}
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center"
          style={{ background: bgColor }}
        >
          <div style={{ color }}>{icon}</div>
        </div>
        {change !== undefined && (
          <div
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold"
            style={{
              background: isPositive ? "rgba(156, 255, 0, 0.1)" : "rgba(255, 0, 106, 0.1)",
              color: isPositive ? "var(--green)" : "var(--red)"
            }}
          >
            {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-sm font-medium mb-1" style={{ color: "var(--text-muted)" }}>
          {title}
        </p>
        <h3 className="text-3xl font-bold mb-1" style={{ color: "var(--text)" }}>
          {value}
        </h3>
        {subtitle && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

interface DashboardStatsProps {
  stats?: {
    totalCases?: number;
    activeCases?: number;
    pendingCases?: number;
    completedToday?: number;
    totalPayments?: number;
    activeUsers?: number;
  };
}

export function DashboardStats({ stats }: DashboardStatsProps) {
  const defaultStats = {
    totalCases: stats?.totalCases ?? 0,
    activeCases: stats?.activeCases ?? 0,
    pendingCases: stats?.pendingCases ?? 0,
    completedToday: stats?.completedToday ?? 0,
    totalPayments: stats?.totalPayments ?? 0,
    activeUsers: stats?.activeUsers ?? 0,
  };

  const cards = [
    {
      title: "Casos Totales",
      value: defaultStats.totalCases,
      change: 12.5,
      icon: <Folder size={24} />,
      color: "var(--gold)",
      bgColor: "rgba(156, 255, 0, 0.1)",
      subtitle: "En el sistema"
    },
    {
      title: "Casos Activos",
      value: defaultStats.activeCases,
      change: 8.2,
      icon: <Activity size={24} />,
      color: "var(--green)",
      bgColor: "rgba(156, 255, 0, 0.1)",
      subtitle: "En progreso"
    },
    {
      title: "Casos Pendientes",
      value: defaultStats.pendingCases,
      change: -5.4,
      icon: <Clock size={24} />,
      color: "var(--amber)",
      bgColor: "rgba(255, 216, 74, 0.1)",
      subtitle: "Requieren atención"
    },
    {
      title: "Completados Hoy",
      value: defaultStats.completedToday,
      change: 18.7,
      icon: <CheckCircle size={24} />,
      color: "var(--cyan)",
      bgColor: "rgba(0, 240, 255, 0.1)",
      subtitle: "Finalizados"
    },
    {
      title: "Pagos Procesados",
      value: `$${defaultStats.totalPayments.toLocaleString()}`,
      change: 15.3,
      icon: <DollarSign size={24} />,
      color: "var(--green)",
      bgColor: "rgba(156, 255, 0, 0.1)",
      subtitle: "Este mes"
    },
    {
      title: "Usuarios Activos",
      value: defaultStats.activeUsers,
      change: 3.1,
      icon: <Users size={24} />,
      color: "var(--gold)",
      bgColor: "rgba(156, 255, 0, 0.1)",
      subtitle: "En línea ahora"
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {cards.map((card, index) => (
        <StatCard key={index} {...card} />
      ))}
    </div>
  );
}
