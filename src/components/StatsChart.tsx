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
  const defaultData: ChartData[] = data ?? [
    { label: "Lun", value: 45, color: "var(--gold)" },
    { label: "Mar", value: 52, color: "var(--gold)" },
    { label: "Mié", value: 38, color: "var(--gold)" },
    { label: "Jue", value: 65, color: "var(--gold)" },
    { label: "Vie", value: 58, color: "var(--gold)" },
    { label: "Sáb", value: 25, color: "var(--text-muted)" },
    { label: "Dom", value: 18, color: "var(--text-muted)" },
  ];

  const maxValue = Math.max(...defaultData.map(d => d.value));

  return (
    <div
      className="rounded-xl p-6"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-glass)"
      }}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold mb-1" style={{ color: "var(--text)" }}>
            {title}
          </h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Casos procesados por día
          </p>
        </div>
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ background: "rgba(74, 222, 128, 0.1)", color: "#4ADE80" }}
        >
          <TrendingUp size={16} />
          <span className="text-sm font-semibold">+12.5%</span>
        </div>
      </div>

      {/* Chart */}
      <div className="flex items-end justify-between gap-3 h-64">
        {defaultData.map((item, index) => {
          const height = (item.value / maxValue) * 100;
          return (
            <div key={index} className="flex-1 flex flex-col items-center gap-3">
              <div className="w-full flex flex-col items-center justify-end flex-1">
                <div
                  className="w-full rounded-t-lg transition-all duration-500 hover:opacity-80 cursor-pointer relative group"
                  style={{
                    height: `${height}%`,
                    background: `linear-gradient(180deg, ${item.color} 0%, ${item.color}CC 100%)`,
                    minHeight: "8px"
                  }}
                >
                  {/* Tooltip */}
                  <div
                    className="absolute -top-10 left-1/2 transform -translate-x-1/2 px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap"
                    style={{
                      background: "var(--bg)",
                      color: "var(--text)",
                      fontSize: "12px",
                      fontWeight: "600"
                    }}
                  >
                    {item.value} casos
                    <div
                      className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 rotate-45"
                      style={{ background: "var(--bg)" }}
                    />
                  </div>
                </div>
              </div>
              <div className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                {item.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-6 pt-6 border-t" style={{ borderColor: "var(--border-glass)" }}>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ background: "var(--gold)" }} />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Días laborales</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ background: "var(--text-muted)" }} />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Fin de semana</span>
        </div>
      </div>
    </div>
  );
}
