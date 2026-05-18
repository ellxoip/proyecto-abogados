import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { notFound } from "next/navigation";
import { Role, CaseStage } from "@/lib/db-enums";
import { Clock, Download, ShieldCheck } from "lucide-react";
import { subDays } from "date-fns";
import { ACTIVITY_LABELS } from "@/lib/productividad/metrics";
import { HoursTableClient } from "./HoursTableClient";
import { QuickTimeEntryLauncher } from "@/components/productividad/QuickTimeEntryLauncher";
import { HelpTip } from "@/components/HelpTip";

export default async function HorasPage() {
  const session = await auth();
  if (!session || session.user.role === Role.CLIENTE) return notFound();

  // Per business rule: only SuperAdmin counts and controls hours of others.
  // Jefe de Grupo y Abogado ven sólo sus propias horas.
  const isSuperAdmin = session.user.role === Role.SUPER_ADMIN;
  const startDate = subDays(new Date(), 30);

  const { entries, totalByCategory, assignableCases } = await withRls(async (tx) => {
    const entries = await tx.timeEntry.findMany({
      where: {
        date: { gte: startDate },
        ...(isSuperAdmin ? {} : { lawyerId: session.user.id }),
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
        ...(isSuperAdmin ? {} : { lawyerId: session.user.id }),
      },
      _sum: { durationMinutes: true },
    });

    // Cases where the current user can log hours.
    // - ABOGADO: only the cases they're assigned to
    // - JEFE_DE_MESA: the cases under their group
    // - SUPER_ADMIN: any non-finished case
    const caseWhere =
      session.user.role === Role.ABOGADO
        ? { abogados: { some: { id: session.user.id } } }
        : session.user.role === Role.JEFE_DE_MESA
        ? {
            OR: [
              { jefe_mesa_id: session.user.id },
              { abogados: { some: { managedById: session.user.id } } },
            ],
          }
        : {};

    const assignableCases = await tx.case.findMany({
      where: {
        ...caseWhere,
        stage: { in: [CaseStage.OPEN, CaseStage.IN_PROGRESS, CaseStage.WAITING_CUOTAS] },
      },
      select: {
        id: true,
        code: true,
        stage: true,
        client: { select: { fullName: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    return { entries, totalByCategory, assignableCases };
  });

  const grandTotal = entries.reduce((acc, e) => acc + e.durationMinutes, 0);

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
    canEdit: e.lawyer.id === session.user.id || isSuperAdmin,
  }));

  const pickerOptions = assignableCases.map((c) => ({
    id: c.id,
    code: c.code,
    stage: c.stage,
    clientName: c.client.fullName,
  }));

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div
              className="p-2 rounded-lg flex items-center justify-center"
              style={{ background: "var(--gold-dim)", border: "1px solid var(--gold-border)" }}
            >
              <Clock className="w-5 h-5" style={{ color: "var(--gold-deep)" }} />
            </div>
            <h1
              className="text-3xl font-bold tracking-tight text-[var(--text)]"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {isSuperAdmin ? "Registro de Horas" : "Mis Horas"}
            </h1>
            <HelpTip
              content={
                isSuperAdmin
                  ? "Como SuperAdmin ves todas las horas registradas por el equipo. Las entradas marcadas con riesgo alto requieren tu revisión: pueden indicar registros tardíos, sesiones extra largas o actividad sobre casos cerrados."
                  : "Aquí registras tus horas trabajadas. Cada entrada queda firmada con tu identidad, hora, IP y un score de riesgo que el SuperAdmin puede revisar para garantizar la integridad de la bitácora."
              }
              size="md"
              asInfo
            />
          </div>
          <p className="text-sm font-medium ml-11" style={{ color: "var(--text-muted)" }}>
            {isSuperAdmin ? "Todo el equipo" : "Mis registros"} · Últimos 30 días ·{" "}
            <strong style={{ color: "var(--gold-deep)" }}>{(grandTotal / 60).toFixed(1)} h total</strong>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {pickerOptions.length > 0 && (
            <QuickTimeEntryLauncher cases={pickerOptions} />
          )}
          {isSuperAdmin && (
            <a
              href="/api/productividad/export?period=30"
              className="btn-secondary"
              title="Exportar a Excel"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar
            </a>
          )}
        </div>
      </header>

      {/* Hint for non-superadmin about audit visibility */}
      {!isSuperAdmin && (
        <div
          className="flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] leading-snug"
          style={{ background: "var(--blue-dim)", borderColor: "var(--blue-border)", color: "var(--blue)" }}
        >
          <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            Tu registro es <strong>auditable</strong>: cada entrada queda con tu identidad, fecha, IP
            y un score de integridad. Mantén descripciones claras para que tu trabajo quede
            correctamente acreditado.
          </span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {totalByCategory.map((cat) => (
          <div key={cat.category} className="kpi-card">
            <p className="kpi-label">{ACTIVITY_LABELS[cat.category]}</p>
            <p className="text-2xl font-bold text-[var(--text)]" style={{ letterSpacing: "-0.02em" }}>
              {((cat._sum.durationMinutes ?? 0) / 60).toFixed(1)} h
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              {grandTotal > 0 ? Math.round(((cat._sum.durationMinutes ?? 0) / grandTotal) * 100) : 0}% del total
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      <HoursTableClient entries={serializedEntries} isManager={isSuperAdmin} />
    </div>
  );
}
