import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { notFound } from "next/navigation";
import { Role, CaseStage } from "@prisma/client";
import Link from "next/link";
import { Shield, ChevronRight } from "lucide-react";
import { computeSlaStatus, slaStatusLabel, slaStatusColor, slaStatusBg } from "@/lib/productividad/sla";
import { SlaManagerClient } from "./SlaManagerClient";

export default async function SlaPage() {
  const session = await auth();
  if (!session || session.user.role === Role.CLIENTE) return notFound();

  const isManager = session.user.role === Role.SUPER_ADMIN || session.user.role === Role.JEFE_DE_MESA;

  const data = await withRls(async (tx) => {
    const categories = await tx.category.findMany({
      orderBy: { name: "asc" },
      include: { slaDefinition: { include: { createdBy: { select: { fullName: true } } } } },
    });

    const activeCases = await tx.case.findMany({
      where: { stage: { notIn: [CaseStage.FINISHED] } },
      include: {
        categoria: { include: { slaDefinition: true } },
        abogados: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return { categories, activeCases };
  });

  type SlaRow = {
    caseId: string;
    code: string;
    category: string;
    stage: string;
    abogados: string;
    status: "CUMPLIDO" | "EN_RIESGO" | "INCUMPLIDO" | "SIN_SLA";
    elapsedDays: number;
    remainingDays: number;
    totalDays: number;
    percentUsed: number;
  };

  const slaRows: SlaRow[] = data.activeCases.map((c) => {
    const slaDef = c.categoria?.slaDefinition;
    if (!slaDef?.active) {
      return {
        caseId: c.id,
        code: c.code,
        category: c.categoria?.name ?? "Sin categoría",
        stage: c.stage,
        abogados: c.abogados.map((a) => a.fullName).join(", ") || "Sin asignar",
        status: "SIN_SLA" as const,
        elapsedDays: 0,
        remainingDays: 0,
        totalDays: 0,
        percentUsed: 0,
      };
    }
    const result = computeSlaStatus(
      { createdAt: c.createdAt, stage: c.stage, halted_at: c.halted_at, resolvedAt: c.resolvedAt },
      slaDef.maxDays
    );
    return {
      caseId: c.id,
      code: c.code,
      category: c.categoria?.name ?? "Sin categoría",
      stage: c.stage,
      abogados: c.abogados.map((a) => a.fullName).join(", ") || "Sin asignar",
      ...result,
    };
  });

  const sorted = [...slaRows].sort((a, b) => {
    const order = { INCUMPLIDO: 0, EN_RIESGO: 1, CUMPLIDO: 2, SIN_SLA: 3 };
    return (order[a.status] ?? 4) - (order[b.status] ?? 4);
  });

  const stats = {
    total: slaRows.filter((r) => r.status !== "SIN_SLA").length,
    cumplido: slaRows.filter((r) => r.status === "CUMPLIDO").length,
    riesgo: slaRows.filter((r) => r.status === "EN_RIESGO").length,
    incumplido: slaRows.filter((r) => r.status === "INCUMPLIDO").length,
  };

  const serializedCategories = data.categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    sla: cat.slaDefinition
      ? { id: cat.slaDefinition.id, maxDays: cat.slaDefinition.maxDays, active: cat.slaDefinition.active }
      : null,
  }));

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-md" style={{ background: "var(--surface-2)" }}>
              <Shield className="w-5 h-5" style={{ color: "var(--gold)" }} />
            </div>
            <h1
              className="text-3xl font-bold tracking-tight text-[var(--text)]"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Gestión de SLAs
            </h1>
          </div>
          <p className="text-sm font-medium ml-11" style={{ color: "var(--text-muted)" }}>
            Service Level Agreements · Tiempos máximos por tipo de expediente
          </p>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Con SLA", value: stats.total, color: "var(--gold)", bg: "var(--surface-2)" },
          { label: "Cumplido", value: stats.cumplido, color: "#4ADE80", bg: "rgba(34, 197, 94, 0.1)" },
          { label: "En riesgo", value: stats.riesgo, color: "#FCD34D", bg: "rgba(245, 158, 11, 0.1)" },
          { label: "Incumplido", value: stats.incumplido, color: "var(--red)", bg: "rgba(220, 38, 38, 0.1)" },
        ].map((s) => (
          <div key={s.label} className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md p-5 shadow-sm">
            <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>{s.label}</p>
            <p className="text-3xl font-bold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* SLA Definitions (manager only) */}
      {isManager && (
        <SlaManagerClient categories={serializedCategories} />
      )}

      {/* Cases table */}
      <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border-glass)]" style={{ background: "var(--surface-2)" }}>
          <h2 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--gold)" }}>
            Estado SLA — Expedientes Activos
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--surface)" }}>
                {["Expediente", "Categoría", "Responsable", "Estado SLA", "Días transcurridos", "Días restantes", "Progreso"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--gold)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-glass)]">
              {sorted.map((row) => (
                <tr key={row.caseId} className="hover:bg-[var(--surface-2)] transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/admin/casos/${row.caseId}`} className="font-bold hover:underline flex items-center gap-1" style={{ color: "var(--gold)" }}>
                      {row.code}
                      <ChevronRight className="w-3 h-3" />
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--text)]">{row.category}</td>
                  <td className="px-4 py-3 text-[11px]" style={{ color: "var(--text-muted)" }}>{row.abogados}</td>
                  <td className="px-4 py-3">
                    <span
                      className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider"
                      style={{ background: slaStatusBg(row.status), color: slaStatusColor(row.status) }}
                    >
                      {slaStatusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-[var(--text)]">
                    {row.status !== "SIN_SLA" ? `${row.elapsedDays}d` : "—"}
                  </td>
                  <td className="px-4 py-3 font-medium" style={{ color: slaStatusColor(row.status) }}>
                    {row.status !== "SIN_SLA" ? `${row.remainingDays}d` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {row.status !== "SIN_SLA" && row.totalDays > 0 ? (
                      <div className="w-24">
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border-glass)" }}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, row.percentUsed)}%`,
                              background: row.status === "INCUMPLIDO" ? "var(--red)" : row.status === "EN_RIESGO" ? "#FCD34D" : "#4ADE80",
                            }}
                          />
                        </div>
                        <p className="text-[9px] mt-0.5" style={{ color: "var(--text-muted)" }}>{Math.round(row.percentUsed)}%</p>
                      </div>
                    ) : (
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Sin SLA</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
