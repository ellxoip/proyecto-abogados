import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { Role } from "@/lib/db-enums";
import { getTeamMetrics, getActivityDistribution } from "@/lib/productividad/metrics";
import { subDays } from "date-fns";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    if (session.user.role !== Role.SUPER_ADMIN && session.user.role !== Role.JEFE_DE_MESA) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") ?? "30";
    const days = parseInt(period, 10);

    const endDate = new Date();
    const startDate = subDays(endDate, days);

    const [teamMetrics, activityDistribution] = await Promise.all([
      getTeamMetrics(startDate, endDate),
      getActivityDistribution(startDate, endDate),
    ]);

    const teamAvg = {
      avgCasesFinished:
        teamMetrics.length > 0
          ? teamMetrics.reduce((a, m) => a + m.casesFinished, 0) / teamMetrics.length
          : 0,
      avgTotalMinutes:
        teamMetrics.length > 0
          ? teamMetrics.reduce((a, m) => a + m.totalMinutes, 0) / teamMetrics.length
          : 0,
      avgSuccessRate:
        teamMetrics.length > 0
          ? teamMetrics.reduce((a, m) => a + m.successRate, 0) / teamMetrics.length
          : 0,
    };

    return NextResponse.json({ teamMetrics, activityDistribution, teamAvg, period: days });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
