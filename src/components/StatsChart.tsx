"use client";

import { TrendingUp } from "lucide-react";

interface ChartData {
  label: string;
  value: number;
  color: string;
}

interface StatsChartProps {
  title?: string;
  data?: ChartData[];
}

export function StatsChart({ title = "Estadísticas Semanales", data }: StatsChartProps) {
  const defaultData: ChartData[] =
    data ?? [
      { label: "Lun", value: 45, color: "var(--gold)" },
      { label: "Mar", value: 52, color: "var(--gold)" },
      { label: "Mié", value: 38, color: "var(--gold)" },
      { label: "Jue", value: 65, color: "var(--gold)" },
      { label: "Vie", value: 58, color: "var(--gold)" },
      { label: "Sáb", value: 25, color: "var(--text-muted)" },
      { label: "Dom", value: 18, color: "var(--text-muted)" },
    ];

  const maxValue = Math.max(...defaultData.map((d) => d.value));

  return (
    <div
      className="rounded-[22px] border border-[var(--border-glass)] p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]"
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,253,0.98) 100%)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
            {title}
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Casos procesados por día
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--gold-border)] bg-[linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
          <TrendingUp size={14} />
          +12.5%
        </div>
      </div>

      <div className="mt-6 rounded-[20px] border border-[var(--border-glass)] bg-[linear-gradient(180deg,#181B38_0%,#26235C_100%)] p-4">
        <div className="flex items-end justify-between gap-3 h-64">
          {defaultData.map((item, index) => {
            const height = (item.value / maxValue) * 100;
            return (
              <div key={index} className="flex flex-1 flex-col items-center gap-3">
                <div className="flex flex-1 w-full flex-col items-center justify-end">
                  <div
                    className="relative w-full overflow-hidden rounded-t-[18px] border border-white/10"
                    style={{ height: `${height}%`, minHeight: "8px" }}
                  >
                    <div
                      className="absolute inset-0"
                      style={{
                        background: `linear-gradient(180deg, ${item.color} 0%, rgba(255,255,255,0.12) 100%)`,
                      }}
                    />
                    <div className="absolute inset-x-0 top-0 h-10 bg-white/10 blur-lg" />
                    <div className="absolute -top-9 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/80 px-2.5 py-1 text-[10px] font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                      {item.value} casos
                    </div>
                  </div>
                </div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.86)" }}>
                  {item.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-glass)] pt-4">
        <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-muted)" }}>
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--gold)]" />
          Días laborables
        </div>
        <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-muted)" }}>
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--text-muted)]" />
          Fin de semana
        </div>
      </div>
    </div>
  );
}
