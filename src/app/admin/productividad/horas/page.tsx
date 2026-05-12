import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { Clock, Download } from "lucide-react";
import { subDays } from "date-fns";
import { ACTIVITY_LABELS } from "@/lib/productividad/metrics";
import { HoursTableClient } from "./HoursTableClient";

export default async function HorasPage() {
  const session = await auth();
  if (!session || session.user.role === Role.CLIENTE) return notFound();

  const isManager = session.user.role === Role.SUPER_ADMIN || session.user.role === Role.JEFE_DE_MESA;
  const startDate = subDays(new Date(), 30);

  const { entries, totalByCategory } = await withRls(async (tx) => {
    const entries = await tx.timeEntry.findMany({
      where: {
        date: { gte: startDate },
        ...(isManager ? {} : { lawyerId: session.user.id }),
      },
      include: {
        lawyer: { select: { id: true, fullName: true } },
        case: { select: { id: true, code: true } },
      },
      orderBy: { date: "desc" },
    });

    const totalByCategory = await tx.timeEntry.groupBy({
      by: ["category"],
      where: {
        date: { gte: startDate },
        ...(isManager ? {} : { lawyerId: session.user.id }),
      },
      _sum: { durationMinutes: true },
    });

    return { entries, totalByCategory };
  });

  const grandTotal = entries.reduce((acc, e) => acc + e.durationMinutes, 0);

  // Lawyers for "by lawyer" breakdown
  const lawyerMap: Record<string, string> = {};
  entries.forEach((e) => { lawyerMap[e.lawyer.id] = e.lawyer.fullName; });

  const serializedEntries = entries.map((e) => ({
    id: e.id,
    date: e.date.toISOString(),
    durationMinutes: e.durationMinutes,
    category: e.category,
    description: e.description,
    lawyerId: e.lawyer.id,
    lawyerName: e.lawyer.fullName,
    caseId: e.case.id,
    caseCode: e.case.code,
    canEdit: e.lawyer.id === session.user.id || session.user.role === Role.SUPER_ADMIN,
  }));

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-md" style={{ background: "var(--surface-2)" }}>
              <Clock className="w-5 h-5" style={{ color: "var(--gold)" }} />
            </div>
            <h1
              className="text-3xl font-bold tracking-tight text-[var(--text)]"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Registro de Horas
            </h1>
          </div>
          <p className="text-sm font-medium ml-11" style={{ color: "var(--text-muted)" }}>
            {isManager ? "Todo el equipo" : "Mis registros"} · Últimos 30 días ·{" "}
            <strong style={{ color: "var(--gold)" }}>{(grandTotal / 60).toFixed(1)}h total</strong>
          </p>
        </div>
        {isManager && (
          <a
            href="/api/productividad/export?period=30"
            className="flex items-center gap-2 px-4 py-2.5 rounded-md text-[11px] font-bold uppercase tracking-widest border transition-colors hover:bg-[var(--surface)]"
            style={{ borderColor: "var(--border-glass)", color: "var(--text-muted)" }}
          >
            <Download className="w-3.5 h-3.5" />
            Exportar Excel
          </a>
        )}
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {totalByCategory.map((cat) => (
          <div key={cat.category} className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md p-4 shadow-sm">
            <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>
              {ACTIVITY_LABELS[cat.category]}
            </p>
            <p className="text-xl font-bold text-[var(--text)]">
              {((cat._sum.durationMinutes ?? 0) / 60).toFixed(1)}h
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              {grandTotal > 0 ? Math.round(((cat._sum.durationMinutes ?? 0) / grandTotal) * 100) : 0}% del total
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      <HoursTableClient
        entries={serializedEntries}
        isManager={isManager}
      />
    </div>
  );
}
