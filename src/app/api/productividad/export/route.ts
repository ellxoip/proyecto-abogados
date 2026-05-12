import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { Role } from "@prisma/client";
import * as XLSX from "xlsx";
import { subDays, format } from "date-fns";
import { ACTIVITY_LABELS } from "@/lib/productividad/metrics";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    if (session.user.role !== Role.SUPER_ADMIN && session.user.role !== Role.JEFE_DE_MESA) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const period = parseInt(searchParams.get("period") ?? "30", 10);
    const endDate = new Date();
    const startDate = subDays(endDate, period);

    const data = await withRls(async (tx) => {
      const entries = await tx.timeEntry.findMany({
        where: { date: { gte: startDate, lte: endDate } },
        include: {
          lawyer: { select: { fullName: true } },
          case: { select: { code: true, categoria: { select: { name: true } } } },
        },
        orderBy: [{ date: "desc" }, { lawyerId: "asc" }],
      });

      const lawyers = await tx.user.findMany({
        where: { role: { in: ["ABOGADO", "JEFE_DE_MESA", "SUPER_ADMIN"] }, active: true },
        select: { id: true, fullName: true },
      });

      const lawyerStats = await Promise.all(
        lawyers.map(async (l) => {
          const assigned = await tx.case.count({
            where: { abogados: { some: { id: l.id } }, createdAt: { gte: startDate, lte: endDate } },
          });
          const finished = await tx.case.count({
            where: {
              abogados: { some: { id: l.id } },
              stage: "FINISHED",
              resolvedAt: { gte: startDate, lte: endDate },
            },
          });
          const mins = await tx.timeEntry.aggregate({
            where: { lawyerId: l.id, date: { gte: startDate, lte: endDate } },
            _sum: { durationMinutes: true },
          });
          return {
            Abogado: l.fullName,
            "Casos Asignados": assigned,
            "Casos Finalizados": finished,
            "Horas Registradas": ((mins._sum.durationMinutes ?? 0) / 60).toFixed(1),
            "Tasa de Éxito": assigned > 0 ? `${Math.round((finished / assigned) * 100)}%` : "0%",
          };
        })
      );

      return { entries, lawyerStats };
    });

    const wb = XLSX.utils.book_new();

    // Sheet 1: Time entries
    const entriesRows = data.entries.map((e) => ({
      Fecha: format(new Date(e.date), "dd/MM/yyyy"),
      Abogado: e.lawyer.fullName,
      Expediente: e.case.code,
      Categoría: e.case.categoria?.name ?? "—",
      Actividad: ACTIVITY_LABELS[e.category],
      "Duración (min)": e.durationMinutes,
      "Duración (h)": (e.durationMinutes / 60).toFixed(2),
      Descripción: e.description ?? "",
    }));
    const ws1 = XLSX.utils.json_to_sheet(entriesRows);
    XLSX.utils.book_append_sheet(wb, ws1, "Registro de Horas");

    // Sheet 2: Lawyer stats
    const ws2 = XLSX.utils.json_to_sheet(data.lawyerStats);
    XLSX.utils.book_append_sheet(wb, ws2, "Métricas de Equipo");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = `AT-INFORMA-Productividad-${format(new Date(), "yyyy-MM-dd")}.xlsx`;

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
