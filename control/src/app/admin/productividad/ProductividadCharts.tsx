"use client";

import { SlaBarChart, ActivityPieChart, RankingBarChart } from "@/components/productividad/ProductividadCharts";
import type { ActivityDistribution, LawyerMetrics } from "@/lib/productividad/metrics";

interface Props {
  slaChartData: { name: string; cumplido: number; en_riesgo: number; incumplido: number }[];
  activityData: ActivityDistribution[];
  teamMetrics: LawyerMetrics[];
  isManager: boolean;
}

export function ProductividadCharts({ slaChartData, activityData, teamMetrics, isManager }: Props) {
  return (
    <div className="space-y-6">
      {/* SLA por categoría */}
      {slaChartData.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--border-glass)]" style={{ background: "var(--surface-2)" }}>
            <h3 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--gold)" }}>
              Cumplimiento de SLA por Categoría
            </h3>
          </div>
          <div className="p-5">
            <SlaBarChart data={slaChartData} />
          </div>
        </div>
      )}

      {/* Actividad */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--border-glass)]" style={{ background: "var(--surface-2)" }}>
            <h3 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--gold)" }}>
              Distribución de Actividades
            </h3>
          </div>
          <div className="p-5">
            <ActivityPieChart data={activityData} />
          </div>
        </div>

        {isManager && teamMetrics.length > 0 && (
          <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border-glass)]" style={{ background: "var(--surface-2)" }}>
              <h3 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--gold)" }}>
                Score por Abogado
              </h3>
            </div>
            <div className="p-5">
              <RankingBarChart data={teamMetrics} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
