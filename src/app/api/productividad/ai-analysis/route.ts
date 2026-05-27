import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { Role, CaseStage } from "@/lib/db-enums";
import { analyzeCaseWithAI } from "@/lib/productividad/openai";
import { computeSlaStatus } from "@/lib/productividad/sla";
import { differenceInCalendarDays } from "date-fns";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const caseId = searchParams.get("caseId");

    const analyses = await withRls(async (tx) => {
      return tx.aiCaseAnalysis.findMany({
        where: caseId ? { caseId } : {},
        orderBy: { analyzedAt: "desc" },
        take: caseId ? 5 : 100,
      });
    });

    return NextResponse.json({ analyses });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    if (session.user.role !== Role.SUPER_ADMIN && session.user.role !== Role.JEFE_DE_MESA) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }

    const body = await req.json();
    const caseId: string | undefined = body.caseId;

    const results = await withRls(async (tx) => {
      const where = caseId
        ? { id: caseId }
        : { stage: { notIn: [CaseStage.FINISHED, CaseStage.HALTED_BY_PAYMENT] } };

      const cases = await tx.case.findMany({
        where,
        include: {
          categoria: { include: { slaDefinition: true } },
          timeEntries: { orderBy: { date: "desc" }, take: 1 },
          updates: { orderBy: { createdAt: "desc" }, take: 1 },
          comments: { where: { type: "PUBLIC" }, orderBy: { createdAt: "desc" }, take: 1 },
          _count: { select: { comments: true, timeEntries: true } },
        },
        take: caseId ? 1 : 50,
      });

      const analysisResults = [];

      for (const c of cases) {
        try {
          const slaDef = c.categoria?.slaDefinition;
          const slaResult = slaDef ? computeSlaStatus(
            { createdAt: c.createdAt, stage: c.stage, halted_at: c.halted_at, resolvedAt: c.resolvedAt },
            slaDef.maxDays
          ) : null;

          const totalMinutesResult = await tx.timeEntry.aggregate({
            where: { caseId: c.id },
            _sum: { durationMinutes: true },
          });

          const lastEntry = c.timeEntries[0];
          const lastUpdate = c.updates[0];

          const input = {
            caseCode: c.code,
            category: c.categoria?.name ?? "Sin categoría",
            stage: c.stage,
            isDelicate: c.is_delicate,
            isPaid: c.is_paid,
            createdAt: c.createdAt,
            lastUpdateAt: lastUpdate?.createdAt ?? null,
            totalTimeEntries: c._count.timeEntries,
            totalMinutesLogged: totalMinutesResult._sum.durationMinutes ?? 0,
            commentsCount: c._count.comments,
            daysSinceLastEntry: lastEntry
              ? differenceInCalendarDays(new Date(), lastEntry.date)
              : differenceInCalendarDays(new Date(), c.createdAt),
            daysSinceLastUpdate: lastUpdate
              ? differenceInCalendarDays(new Date(), lastUpdate.createdAt)
              : differenceInCalendarDays(new Date(), c.createdAt),
            slaMaxDays: slaDef?.maxDays ?? null,
            slaElapsedDays: slaResult?.elapsedDays ?? 0,
          };

          const aiResult = await analyzeCaseWithAI(input);

          const saved = await tx.aiCaseAnalysis.create({
            data: {
              caseId: c.id,
              healthScore: aiResult.healthScore,
              riskLevel: aiResult.riskLevel as any,
              estimatedDays: aiResult.estimatedDays,
              minDays: aiResult.minDays,
              maxDays: aiResult.maxDays,
              stagnant: aiResult.stagnant,
              explanation: aiResult.explanation,
              recommendations: aiResult.recommendations as any,
            },
          });

          analysisResults.push({ caseId: c.id, code: c.code, analysis: saved });
        } catch (e: any) {
          analysisResults.push({ caseId: c.id, code: c.code, error: e.message });
        }
      }

      return analysisResults;
    });

    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
