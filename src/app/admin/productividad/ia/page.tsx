import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { Brain, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { AiAnalyzeButton } from "./AiAnalyzeButton";

export default async function IaPage() {
  const session = await auth();
  if (!session || session.user.role === Role.CLIENTE) return notFound();

  const isManager = session.user.role === Role.SUPER_ADMIN || session.user.role === Role.JEFE_DE_MESA;

  const data = await withRls(async (tx) => {
    const analyses = await tx.aiCaseAnalysis.findMany({
      include: {
        case: {
          select: {
            id: true, code: true, stage: true,
            categoria: { select: { name: true } },
            abogados: { select: { fullName: true } },
          },
        },
      },
      orderBy: { analyzedAt: "desc" },
      take: 100,
    });

    // Get latest per case
    const seen = new Set<string>();
    const latest = analyses.filter((a) => {
      if (seen.has(a.caseId)) return false;
      seen.add(a.caseId);
      return true;
    });

    return { latest };
  });

  const { latest } = data;

  const byRisk = {
    CRITICO: latest.filter((a) => a.riskLevel === "CRITICO"),
    ALTO: latest.filter((a) => a.riskLevel === "ALTO"),
    MEDIO: latest.filter((a) => a.riskLevel === "MEDIO"),
    BAJO: latest.filter((a) => a.riskLevel === "BAJO"),
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-md" style={{ background: "var(--surface-2)" }}>
              <Brain className="w-5 h-5" style={{ color: "var(--gold)" }} />
            </div>
            <h1
              className="text-3xl font-bold tracking-tight text-[var(--text)]"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Análisis de IA
            </h1>
          </div>
          <p className="text-sm font-medium ml-11" style={{ color: "var(--text-muted)" }}>
            Estado de salud y recomendaciones para cada expediente activo
          </p>
        </div>
        {isManager && <AiAnalyzeButton />}
      </header>

      {/* Risk summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Crítico", key: "CRITICO" as const, color: "var(--red)", bg: "rgba(220, 38, 38, 0.1)", icon: AlertTriangle },
          { label: "Alto riesgo", key: "ALTO" as const, color: "#FBBF24", bg: "rgba(245, 158, 11, 0.1)", icon: AlertTriangle },
          { label: "Riesgo medio", key: "MEDIO" as const, color: "#FCD34D", bg: "rgba(253, 230, 138, 0.1)", icon: Info },
          { label: "Bajo riesgo", key: "BAJO" as const, color: "#4ADE80", bg: "rgba(34, 197, 94, 0.1)", icon: CheckCircle },
        ].map(({ label, key, color, bg, icon: Icon }) => (
          <div key={key} className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded" style={{ background: bg }}>
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{label}</span>
            </div>
            <div className="text-3xl font-bold" style={{ color }}>{byRisk[key].length}</div>
          </div>
        ))}
      </div>

      {latest.length === 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md p-12 text-center shadow-sm">
          <Brain className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--border-glass)" }} />
          <p className="font-bold text-[var(--text)] mb-2">Sin análisis de IA todavía</p>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Haz clic en "Analizar todos con IA" para obtener diagnósticos automáticos de todos los expedientes activos.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {(["CRITICO", "ALTO", "MEDIO", "BAJO"] as const).map((risk) => {
            const group = byRisk[risk];
            if (!group.length) return null;
            const riskConfig = {
              CRITICO: { label: "Críticos", color: "var(--red)", bg: "rgba(220, 38, 38, 0.1)", border: "rgba(248, 113, 113, 0.2)" },
              ALTO: { label: "Alto Riesgo", color: "#FBBF24", bg: "rgba(245, 158, 11, 0.1)", border: "rgba(251, 191, 36, 0.2)" },
              MEDIO: { label: "Riesgo Medio", color: "#FCD34D", bg: "rgba(253, 230, 138, 0.1)", border: "rgba(251, 191, 36, 0.2)" },
              BAJO: { label: "Saludables", color: "#4ADE80", bg: "rgba(34, 197, 94, 0.1)", border: "rgba(74, 222, 128, 0.2)" },
            }[risk];

            return (
              <div key={risk} className="space-y-3">
                <h2 className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2" style={{ color: riskConfig.color }}>
                  <div className="w-2 h-2 rounded-full" style={{ background: riskConfig.color }} />
                  {riskConfig.label} ({group.length})
                </h2>
                <div className="space-y-3">
                  {group.map((a) => {
                    const recs = (a.recommendations as any[] | null) ?? [];
                    return (
                      <div
                        key={a.id}
                        className="bg-[var(--surface)] border rounded-md shadow-sm overflow-hidden"
                        style={{ borderColor: "var(--border-glass)" }}
                      >
                        <div className="px-5 py-4 flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1.5">
                              <Link
                                href={`/admin/casos/${a.case.id}`}
                                className="font-bold hover:underline"
                                style={{ color: "var(--gold)" }}
                              >
                                {a.case.code}
                              </Link>
                              <span
                                className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                                style={{ background: riskConfig.bg, color: riskConfig.color }}
                              >
                                {risk}
                              </span>
                              {a.stagnant && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider" style={{ background: "rgba(245, 158, 11, 0.1)", color: "#FCD34D" }}>
                                  Estancado
                                </span>
                              )}
                              <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
                                {a.case.categoria?.name ?? "Sin cat."} · {a.case.abogados.map((ab) => ab.fullName).join(", ") || "Sin asignar"}
                              </span>
                            </div>
                            <p className="text-sm text-[var(--text)] leading-relaxed">{a.explanation}</p>
                          </div>
                          <div className="flex-shrink-0 text-center">
                            <div
                              className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold border-4"
                              style={{
                                borderColor: riskConfig.color,
                                color: riskConfig.color,
                                background: riskConfig.bg,
                              }}
                            >
                              {a.healthScore}
                            </div>
                            <div className="text-[9px] mt-1" style={{ color: "var(--text-muted)" }}>Health Score</div>
                          </div>
                        </div>

                        {recs.length > 0 && (
                          <div className="border-t border-[var(--border-glass)] px-5 py-3 space-y-2" style={{ background: "var(--surface)" }}>
                            <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>
                              Recomendaciones IA
                            </p>
                            {recs.map((rec: any, i: number) => (
                              <div key={i} className="flex items-start gap-3">
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase flex-shrink-0"
                                  style={{
                                    background: rec.priority === "Urgente" ? "rgba(220, 38, 38, 0.1)" : rec.priority === "Alta" ? "rgba(245, 158, 11, 0.1)" : "var(--surface)",
                                    color: rec.priority === "Urgente" ? "var(--red)" : rec.priority === "Alta" ? "#FCD34D" : "var(--text-muted)",
                                  }}
                                >
                                  {rec.priority}
                                </span>
                                <div>
                                  <p className="text-xs font-semibold text-[var(--text)]">{rec.action}</p>
                                  <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{rec.reason}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {a.estimatedDays !== null && (
                          <div className="border-t border-[var(--border-glass)] px-5 py-2 flex items-center gap-4">
                            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                              Tiempo estimado de resolución:{" "}
                              <strong style={{ color: "var(--text)" }}>
                                {a.minDays}–{a.maxDays} días
                              </strong>{" "}
                              (probable: <strong>{a.estimatedDays}d</strong>)
                            </p>
                            <span className="text-[10px] ml-auto" style={{ color: "var(--text-muted)" }}>
                              Analizado {format(new Date(a.analyzedAt), "dd/MM HH:mm")}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
