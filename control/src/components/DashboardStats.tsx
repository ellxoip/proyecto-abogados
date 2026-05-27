"use client";

import { useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  Folder,
  Users,
  Clock,
  CheckCircle,
  DollarSign,
  Activity,
  ArrowUpRight,
  Sparkles,
  ExternalLink,
  X,
  Inbox,
} from "lucide-react";
import { stageLabel } from "@/lib/labels";

// ── Types ─────────────────────────────────────────────────────────────────
type DrilldownCase = {
  id: string;
  code: string;
  stage: string;
  clientName: string;
  categoryName: string | null;
  updatedAt: string;
  resolvedAt: string | null;
};

type DrilldownUser = {
  id: string;
  name: string;
  role: string;
  lastSeenAt: string | null;
};

export type DashboardDrilldown = {
  total: DrilldownCase[];
  active: DrilldownCase[];
  pending: DrilldownCase[];
  completedToday: DrilldownCase[];
  onlineUsers: DrilldownUser[];
};

type CardKey = "total" | "active" | "pending" | "completedToday" | "payments" | "onlineUsers";

interface DashboardStatsProps {
  stats?: {
    totalCases?: number;
    activeCases?: number;
    pendingCases?: number;
    completedToday?: number;
    totalPayments?: number;
    activeUsers?: number;
  };
  drilldown?: DashboardDrilldown;
}

// ── StatCard ──────────────────────────────────────────────────────────────
function StatCard({
  title,
  value,
  change,
  icon,
  bgColor,
  subtitle,
  onClick,
}: {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  bgColor: string;
  subtitle?: string;
  onClick?: () => void;
}) {
  const isPositive = change !== undefined && change >= 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left rounded-[22px] border border-[var(--border-glass)] p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(15,23,42,0.10)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:ring-offset-2"
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(247,249,253,0.98) 100%)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 shadow-sm"
          style={{ background: bgColor, color: "#FFFFFF" }}
        >
          <div style={{ color: "#FFFFFF" }}>{icon}</div>
        </div>
        {change !== undefined && (
          <div
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{
              background: isPositive ? "rgba(22, 163, 74, 0.10)" : "rgba(220, 38, 38, 0.10)",
              color: isPositive ? "var(--green)" : "var(--red)",
            }}
          >
            {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <div className="mt-4">
        <p
          className="text-[10px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: "var(--text-muted)" }}
        >
          {title}
        </p>
        <h3
          className="mt-2 text-3xl font-bold tracking-tight"
          style={{ color: "var(--text)" }}
        >
          {value}
        </h3>
        {subtitle && (
          <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
            {subtitle}
          </p>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-[var(--border-glass)] pt-4">
        <div
          className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: "var(--text-muted)" }}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Vista ejecutiva
        </div>
        <ArrowUpRight className="h-4 w-4 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
    </button>
  );
}

// ── Drilldown Modal ───────────────────────────────────────────────────────
function DrilldownModal({
  cardKey,
  title,
  value,
  drilldown,
  onClose,
}: {
  cardKey: CardKey;
  title: string;
  value: string | number;
  drilldown: DashboardDrilldown;
  onClose: () => void;
}) {
  function renderBody() {
    if (cardKey === "payments") {
      return (
        <div className="p-8 text-center">
          <DollarSign className="mx-auto h-10 w-10 text-[var(--text-dim)] mb-3" />
          <p className="text-sm font-semibold text-[var(--text)]">Sin pagos procesados este mes</p>
          <p className="mt-1 text-xs text-[var(--text-muted)] max-w-sm mx-auto">
            Los pagos confirmados aparecerán aquí cuando se vinculen con un caso.
          </p>
          <Link href="/admin/mora" className="btn-secondary mt-4 text-xs">
            Ir a Gestión de Mora
          </Link>
        </div>
      );
    }

    if (cardKey === "onlineUsers") {
      if (drilldown.onlineUsers.length === 0) {
        return <EmptyHint icon={Users} message="Nadie del equipo está en línea en este momento." />;
      }
      return (
        <ul className="divide-y" style={{ borderColor: "var(--card-border)" }}>
          {drilldown.onlineUsers.map((u) => (
            <li
              key={u.id}
              className="flex items-center justify-between px-5 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-bold text-white shrink-0"
                  style={{ background: "linear-gradient(135deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)" }}
                >
                  {u.name.split(/\s+/).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join("")}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text)] truncate">{u.name}</p>
                  <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider">
                    {u.role.replace(/_/g, " ").toLowerCase()}
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ background: "var(--green-dim)", color: "var(--green)", borderColor: "var(--green-border)" }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                En línea
              </span>
            </li>
          ))}
        </ul>
      );
    }

    const list =
      cardKey === "active"
        ? drilldown.active
        : cardKey === "pending"
        ? drilldown.pending
        : cardKey === "completedToday"
        ? drilldown.completedToday
        : drilldown.total;

    if (list.length === 0) {
      return <EmptyHint icon={Inbox} message="No hay registros que mostrar en esta vista." />;
    }

    return (
      <ul className="divide-y" style={{ borderColor: "var(--card-border)" }}>
        {list.map((c) => (
          <li key={c.id}>
            <Link
              href={`/admin/casos/${c.id}`}
              className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-[var(--row-hover)]"
            >
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold text-[var(--text)]">{c.code}</p>
                <p className="text-xs text-[var(--text-muted)] truncate">
                  {c.clientName}
                  {c.categoryName ? ` · ${c.categoryName}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    background: "var(--surface-3)",
                    color: "var(--text-muted)",
                    borderColor: "var(--card-border)",
                  }}
                >
                  {stageLabel(c.stage)}
                </span>
                <ExternalLink className="h-3.5 w-3.5 text-[var(--text-dim)]" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  function ctaHref(): { href: string; label: string } {
    switch (cardKey) {
      case "active":
      case "total":
        return { href: "/admin/casos", label: "Ver Gestión de Casos" };
      case "pending":
        return { href: "/admin/bandeja", label: "Abrir Bandeja" };
      case "completedToday":
        return { href: "/admin/metricas", label: "Métricas de Operación" };
      case "onlineUsers":
        return { href: "/admin/mensajeria", label: "Centro de Mensajería" };
      case "payments":
      default:
        return { href: "/admin/mora", label: "Gestión de Mora" };
    }
  }
  const cta = ctaHref();

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
        aria-labelledby="drilldown-title"
        className="w-full max-w-xl rounded-2xl bg-[var(--surface)] shadow-[var(--shadow-xl)] animate-in zoom-in-95 duration-150 overflow-hidden"
        style={{ border: "1px solid var(--card-border)" }}
      >
        <div
          className="px-6 py-5 flex items-center justify-between gap-3"
          style={{
            background: "linear-gradient(135deg, var(--sidebar-bg) 0%, #2E2B6A 100%)",
            color: "#FFFFFF",
            borderBottom: "1px solid var(--sidebar-border)",
          }}
        >
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-white">
              Detalle ejecutivo
            </p>
            <h3 id="drilldown-title" className="mt-1 text-xl font-bold">
              {title}
            </h3>
            <p className="mt-0.5 text-2xl font-bold" style={{ color: "var(--gold-soft)" }}>
              {value}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">{renderBody()}</div>

        <div
          className="flex items-center justify-end gap-2 px-6 py-3"
          style={{ background: "var(--surface-2)", borderTop: "1px solid var(--card-border)" }}
        >
          <button type="button" onClick={onClose} className="btn-secondary">
            Cerrar
          </button>
          <Link href={cta.href} className="btn-primary" onClick={onClose}>
            {cta.label}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function EmptyHint({ icon: Icon, message }: { icon: any; message: string }) {
  return (
    <div className="p-8 text-center">
      <div
        className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl"
        style={{ background: "var(--surface-3)", border: "1px solid var(--card-border)" }}
      >
        <Icon className="h-4 w-4 text-[var(--text-muted)]" />
      </div>
      <p className="text-sm text-[var(--text-muted)]">{message}</p>
    </div>
  );
}

// ── DashboardStats main component ─────────────────────────────────────────
const EMPTY_DRILLDOWN: DashboardDrilldown = {
  total: [],
  active: [],
  pending: [],
  completedToday: [],
  onlineUsers: [],
};

export function DashboardStats({ stats, drilldown }: DashboardStatsProps) {
  const dd = drilldown ?? EMPTY_DRILLDOWN;
  const [open, setOpen] = useState<null | { key: CardKey; title: string; value: string | number }>(null);

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
      key: "total" as CardKey,
      title: "Casos Totales",
      value: defaultStats.totalCases,
      change: 12.5,
      icon: <Folder size={24} />,
      bgColor: "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
      subtitle: "En el sistema",
    },
    {
      key: "active" as CardKey,
      title: "Casos Activos",
      value: defaultStats.activeCases,
      change: 8.2,
      icon: <Activity size={24} />,
      bgColor: "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
      subtitle: "En progreso",
    },
    {
      key: "pending" as CardKey,
      title: "Casos Pendientes",
      value: defaultStats.pendingCases,
      change: -5.4,
      icon: <Clock size={24} />,
      bgColor: "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
      subtitle: "Requieren atención",
    },
    {
      key: "completedToday" as CardKey,
      title: "Completados Hoy",
      value: defaultStats.completedToday,
      change: 18.7,
      icon: <CheckCircle size={24} />,
      bgColor: "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
      subtitle: "Finalizados",
    },
    {
      key: "payments" as CardKey,
      title: "Pagos Procesados",
      value: `$${defaultStats.totalPayments.toLocaleString()}`,
      change: 15.3,
      icon: <DollarSign size={24} />,
      bgColor: "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
      subtitle: "Este mes",
    },
    {
      key: "onlineUsers" as CardKey,
      title: "Usuarios Activos",
      value: defaultStats.activeUsers,
      change: 3.1,
      icon: <Users size={24} />,
      bgColor: "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
      subtitle: "En línea ahora",
    },
  ];

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <StatCard
            key={card.key}
            title={card.title}
            value={card.value}
            change={card.change}
            icon={card.icon}
            bgColor={card.bgColor}
            subtitle={card.subtitle}
            onClick={() => setOpen({ key: card.key, title: card.title, value: card.value })}
          />
        ))}
      </div>

      {open && (
        <DrilldownModal
          cardKey={open.key}
          title={open.title}
          value={open.value}
          drilldown={dd}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
