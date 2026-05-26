import { NextRequest, NextResponse } from "next/server";
import {
  parseReportFilters,
  reportCuentasPorCobrar,
  reportMorosidad,
  reportPagosRecibidos,
  reportProyeccionCaja,
  reportVencimientos,
  toCsv,
} from "@/server/reports/reporting";
import {
  reportEfectividadCobranza,
  reportCompromisosPago,
  reportClientesNuevos,
  reportDistribucionClientes,
  reportRetencion,
  reportLTV,
  reportCarteraServicios,
  reportModificaciones,
  reportCondonaciones,
  reportCasosLegales,
  reportCuotasCasosVsRegulares,
} from "@/server/reports/new-reports";

function sp(request: NextRequest, key: string): string | undefined {
  return request.nextUrl.searchParams.get(key) ?? undefined;
}

function toDate(v: string | undefined): Date | undefined {
  return v ? new Date(v) : undefined;
}

async function getRows(tipo: string, request: NextRequest) {
  const filters = parseReportFilters(request.nextUrl.searchParams);
  const from = toDate(sp(request, "from"));
  const to = toDate(sp(request, "to"));

  switch (tipo) {
    case "pagos":
      return reportPagosRecibidos(filters);
    case "cxc":
      return reportCuentasPorCobrar(filters);
    case "vencimientos":
      return reportVencimientos(filters);
    case "morosidad":
      return reportMorosidad(filters);
    case "proyeccion":
      return reportProyeccionCaja(filters);
    case "efectividad-cobranza":
      return (await reportEfectividadCobranza({ from, to })).rows;
    case "compromisos":
      return (await reportCompromisosPago({ estado: sp(request, "estado") })).rows;
    case "clientes-nuevos":
      return (await reportClientesNuevos({ from, to })).rows;
    case "distribucion-clientes":
      return (await reportDistribucionClientes()).rows;
    case "retencion":
      return (await reportRetencion({ from, to })).rows;
    case "ltv":
      return (await reportLTV({ q: sp(request, "q") })).rows;
    case "cartera-servicios":
      return (await reportCarteraServicios({ from, to })).rows;
    case "modificaciones":
      return (await reportModificaciones({ from, to, tipo: sp(request, "tipo") })).rows;
    case "condonaciones":
      return (await reportCondonaciones({ from, to })).rows;
    case "casos-legales":
      return (await reportCasosLegales({ from, to, estado: sp(request, "estado") })).rows;
    case "cuotas-casos":
      return (await reportCuotasCasosVsRegulares()).rows;
    default:
      throw new Error("Reporte no soportado");
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tipo: string }> },
) {
  try {
    const { tipo } = await context.params;
    const rows = await getRows(tipo, request);
    const format = request.nextUrl.searchParams.get("format");

    if (format === "csv") {
      const csv = toCsv(rows as Record<string, unknown>[]);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="reporte-${tipo}.csv"`,
        },
      });
    }

    return NextResponse.json({ rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
