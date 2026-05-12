import { CaseStage, ActivityCategory } from "@prisma/client";
import { differenceInCalendarDays } from "date-fns";
import { withRls } from "@/lib/rls";

export type LawyerMetrics = {
  lawyerId: string;
  fullName: string;
  casesAssigned: number;
  casesFinished: number;
  totalMinutes: number;
  avgMinutesPerCase: number;
  avgDaysToFinish: number;
  successRate: number;
  compositeScore: number;
};

export type ActivityDistribution = {
  category: ActivityCategory;
  label: string;
  totalMinutes: number;
  percentage: number;
};

export const ACTIVITY_LABELS: Record<ActivityCategory, string> = {
  INVESTIGACION: "Investigación",
  REDACCION: "Redacción de documentos",
  AUDIENCIAS: "Audiencias",
  REUNIONES: "Reuniones con cliente",
  GESTION_ADMINISTRATIVA: "Gestión administrativa",
  OTRO: "Otro",
};

export async function getTeamMetrics(startDate: Date, endDate: Date) {
  return withRls(async (tx) => {
    const lawyers = await tx.user.findMany({
      where: { role: { in: ["ABOGADO", "JEFE_DE_MESA", "SUPER_ADMIN"] }, active: true },
      select: { id: true, fullName: true },
    });

    const metrics: LawyerMetrics[] = [];

    for (const lawyer of lawyers) {
      const assigned = await tx.case.count({
        where: { abogados: { some: { id: lawyer.id } }, createdAt: { gte: startDate, lte: endDate } },
      });

      const finishedCases = await tx.case.findMany({
        where: {
          abogados: { some: { id: lawyer.id } },
          stage: CaseStage.FINISHED,
          resolvedAt: { gte: startDate, lte: endDate },
        },
        select: { createdAt: true, resolvedAt: true },
      });

      const finished = finishedCases.length;

      const totalMinutesResult = await tx.timeEntry.aggregate({
        where: { lawyerId: lawyer.id, date: { gte: startDate, lte: endDate } },
        _sum: { durationMinutes: true },
      });
      const totalMinutes = totalMinutesResult._sum.durationMinutes ?? 0;

      const avgMinutesPerCase = finished > 0 ? totalMinutes / finished : 0;

      const avgDaysToFinish =
        finished > 0
          ? finishedCases.reduce((acc, c) => {
              const days = c.resolvedAt
                ? differenceInCalendarDays(c.resolvedAt, c.createdAt)
                : 0;
              return acc + days;
            }, 0) / finished
          : 0;

      const successRate = assigned > 0 ? finished / assigned : 0;

      // Score: (casesFinished × 40) + (successRate × 100 × 30) + (avgDaysToFinish inversion × 30)
      // Simplified: (finished * 40) + (successRate * 30) + (successRate * 30)
      const compositeScore = finished * 40 + successRate * 100 * 30 + successRate * 100 * 30;

      metrics.push({
        lawyerId: lawyer.id,
        fullName: lawyer.fullName,
        casesAssigned: assigned,
        casesFinished: finished,
        totalMinutes,
        avgMinutesPerCase,
        avgDaysToFinish,
        successRate,
        compositeScore,
      });
    }

    return metrics.sort((a, b) => b.compositeScore - a.compositeScore);
  });
}

export async function getActivityDistribution(startDate: Date, endDate: Date): Promise<ActivityDistribution[]> {
  return withRls(async (tx) => {
    const entries = await tx.timeEntry.groupBy({
      by: ["category"],
      where: { date: { gte: startDate, lte: endDate } },
      _sum: { durationMinutes: true },
    });

    const total = entries.reduce((acc, e) => acc + (e._sum.durationMinutes ?? 0), 0);

    return entries.map((e) => ({
      category: e.category,
      label: ACTIVITY_LABELS[e.category],
      totalMinutes: e._sum.durationMinutes ?? 0,
      percentage: total > 0 ? ((e._sum.durationMinutes ?? 0) / total) * 100 : 0,
    }));
  });
}

export async function detectStagnantCases() {
  return withRls(async (tx) => {
    const cutoffTimeEntry = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const cutoffUpdate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const activeCases = await tx.case.findMany({
      where: {
        stage: { notIn: [CaseStage.FINISHED, CaseStage.HALTED_BY_PAYMENT, CaseStage.WAITING_CUOTAS] },
      },
      include: {
        timeEntries: { orderBy: { date: "desc" }, take: 1 },
        updates: { orderBy: { createdAt: "desc" }, take: 1 },
        abogados: { select: { id: true, fullName: true } },
        jefeMesa: { select: { id: true, fullName: true } },
        categoria: true,
      },
    });

    return activeCases
      .filter((c) => {
        const lastEntry = c.timeEntries[0];
        const lastUpdate = c.updates[0];
        const noRecentHours = !lastEntry || lastEntry.date < cutoffTimeEntry;
        const noRecentUpdate = !lastUpdate || lastUpdate.createdAt < cutoffUpdate;
        return noRecentHours || noRecentUpdate;
      })
      .map((c) => ({
        caseId: c.id,
        code: c.code,
        lastTimeEntry: c.timeEntries[0]?.date ?? null,
        lastUpdate: c.updates[0]?.createdAt ?? null,
        abogados: c.abogados,
        jefeMesa: c.jefeMesa,
        category: c.categoria?.name ?? "Sin categoría",
        daysSinceActivity: c.timeEntries[0]
          ? differenceInCalendarDays(new Date(), c.timeEntries[0].date)
          : differenceInCalendarDays(new Date(), c.createdAt),
      }));
  });
}
