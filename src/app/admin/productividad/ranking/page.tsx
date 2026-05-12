import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { Medal, Star } from "lucide-react";
import { subDays } from "date-fns";
import { getTeamMetrics } from "@/lib/productividad/metrics";

export default async function RankingPage() {
  const session = await auth();
  if (!session || session.user.role === Role.CLIENTE || session.user.role === Role.ABOGADO) return notFound();

  const endDate = new Date();
  const ranking = await getTeamMetrics(subDays(endDate, 30), endDate);

  const teamTotal = ranking.reduce((a, m) => a + m.totalMinutes, 0);
  const teamCases = ranking.reduce((a, m) => a + m.casesFinished, 0);
  const teamAvgScore = ranking.length > 0 ? ranking.reduce((a, m) => a + m.compositeScore, 0) / ranking.length : 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-md" style={{ background: "var(--surface-2)" }}>
              <Medal className="w-5 h-5" style={{ color: "var(--gold)" }} />
            </div>
            <h1
              className="text-3xl font-bold tracking-tight text-[var(--text)]"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Ranking de Productividad
            </h1>
          </div>
          <p className="text-sm font-medium ml-11" style={{ color: "var(--text-muted)" }}>
            Desempeño del equipo · Últimos 30 días
          </p>
        </div>
      </header>

      {/* Team summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md p-5 shadow-sm">
          <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>Horas Totales Equipo</p>
          <p className="text-3xl font-bold text-[var(--text)]">{(teamTotal / 60).toFixed(0)}h</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md p-5 shadow-sm">
          <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>Casos Finalizados</p>
          <p className="text-3xl font-bold text-[var(--text)]">{teamCases}</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md p-5 shadow-sm">
          <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>Score Promedio Equipo</p>
          <p className="text-3xl font-bold text-[var(--text)]">{Math.round(teamAvgScore)}</p>
        </div>
      </div>

      {/* Top 3 podium */}
      {ranking.length >= 3 && (
        <div className="grid grid-cols-3 gap-4">
          {[1, 0, 2].map((idx) => {
            const m = ranking[idx];
            if (!m) return null;
            const pos = idx + 1;
            const medals: Record<number, { bg: string; color: string; size: string }> = {
              1: { bg: "var(--gold)", color: "var(--text)", size: "text-4xl" },
              2: { bg: "#C0C0C0", color: "var(--text)", size: "text-3xl" },
              3: { bg: "#CD7F32", color: "var(--text)", size: "text-3xl" },
            };
            const style = medals[pos];
            return (
              <div
                key={m.lawyerId}
                className={`bg-[var(--surface)] border rounded-md p-6 shadow-sm text-center ${pos === 1 ? "border-[var(--gold)] shadow-md" : "border-[var(--border-glass)]"}`}
              >
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 text-xl font-bold"
                  style={{ background: style.bg, color: style.color }}
                >
                  {pos}
                </div>
                <div className="font-bold text-[var(--text)] mb-1">{m.fullName}</div>
                {pos === 1 && (
                  <div className="flex items-center justify-center gap-1 mb-2">
                    <Star className="w-3.5 h-3.5" style={{ color: "var(--gold)", fill: "var(--gold)" }} />
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--gold)" }}>Top Performer</span>
                  </div>
                )}
                <div className={`font-bold mb-1 ${style.size}`} style={{ color: "var(--text)" }}>
                  {Math.round(m.compositeScore)}
                </div>
                <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>Score compuesto</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                  <div>
                    <div className="font-bold text-sm text-[var(--text)]">{m.casesFinished}</div>
                    <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>casos cerrados</div>
                  </div>
                  <div>
                    <div className="font-bold text-sm text-[var(--text)]">{(m.totalMinutes / 60).toFixed(0)}h</div>
                    <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>registradas</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full ranking table */}
      <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border-glass)]" style={{ background: "var(--surface-2)" }}>
          <h2 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--gold)" }}>
            Tabla Completa de Ranking
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--surface)" }}>
                {["#", "Abogado", "Casos asignados", "Casos cerrados", "Tasa éxito", "Horas", "Prom. días/caso", "Score"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--gold)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-glass)]">
              {ranking.map((m, i) => {
                const isAboveAvg = m.compositeScore > teamAvgScore;
                const isBelowThreshold = m.compositeScore < teamAvgScore * 0.7;
                return (
                  <tr key={m.lawyerId} className="hover:bg-[var(--surface-2)] transition-colors">
                    <td className="px-4 py-3 w-12">
                      {i < 3 ? (
                        <span
                          className="flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold"
                          style={{ background: i === 0 ? "var(--gold)" : i === 1 ? "#C0C0C0" : "#CD7F32", color: i === 0 ? "var(--bg)" : "white" }}
                        >
                          {i + 1}
                        </span>
                      ) : (
                        <span className="font-medium" style={{ color: "var(--text-muted)" }}>{i + 1}</span>
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
                    <td className="px-4 py-3 text-center font-medium text-[var(--text)]">{m.casesAssigned}</td>
                    <td className="px-4 py-3 text-center font-medium text-[var(--text)]">{m.casesFinished}</td>
                    <td className="px-4 py-3 text-center font-bold" style={{ color: m.successRate >= 0.7 ? "#4ADE80" : m.successRate >= 0.5 ? "#FCD34D" : "var(--red)" }}>
                      {Math.round(m.successRate * 100)}%
                    </td>
                    <td className="px-4 py-3 text-center text-[var(--text)]">{(m.totalMinutes / 60).toFixed(0)}h</td>
                    <td className="px-4 py-3 text-center text-[var(--text)]">{m.avgDaysToFinish.toFixed(1)}d</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className="font-bold px-2 py-1 rounded text-sm"
                        style={{
                          background: isAboveAvg ? "rgba(34, 197, 94, 0.1)" : isBelowThreshold ? "rgba(220, 38, 38, 0.1)" : "var(--surface-2)",
                          color: isAboveAvg ? "#4ADE80" : isBelowThreshold ? "var(--red)" : "var(--gold)",
                        }}
                      >
                        {Math.round(m.compositeScore)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
