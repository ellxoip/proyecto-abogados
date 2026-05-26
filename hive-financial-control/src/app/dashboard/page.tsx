import Link from "next/link";
import { EstadoCliente, EstadoContrato, EstadoCuota } from "@prisma/client";
import {
  startOfDay, endOfDay,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  subMonths, addDays, eachDayOfInterval, eachMonthOfInterval,
} from "date-fns";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import { AtInformaSyncButton } from "@/app/components/at-informa-sync-button";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type Periodo = "hoy" | "semana" | "mes" | "mes_anterior";

const MONTH_NAMES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

function getPeriodRange(periodo: Periodo, now: Date) {
  switch (periodo) {
    case "hoy":
      return { start: startOfDay(now), end: endOfDay(now), label: `Hoy, ${now.getDate()} de ${MONTH_NAMES[now.getMonth()]}` };
    case "semana": {
      const ws = startOfWeek(now, { weekStartsOn: 1 });
      const we = endOfWeek(now, { weekStartsOn: 1 });
      return { start: ws, end: we, label: `Semana del ${ws.getDate()} de ${MONTH_NAMES[ws.getMonth()]}` };
    }
    case "mes_anterior": {
      const prev = subMonths(now, 1);
      return { start: startOfMonth(prev), end: endOfMonth(prev), label: `${MONTH_NAMES[prev.getMonth()]} ${prev.getFullYear()}` };
    }
    case "mes":
    default:
      return { start: startOfMonth(now), end: endOfMonth(now), label: `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}` };
  }
}

const PERIODOS: { value: Periodo; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "semana", label: "Esta semana" },
  { value: "mes", label: "Este mes" },
  { value: "mes_anterior", label: "Mes anterior" },
];

// ── SVG helpers ────────────────────────────────────────────────────

function buildSparklinePath(values: number[], w = 80, h = 32): string {
  if (values.length < 2) return "";
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return pts.join(" ");
}

function Sparkline({ values, positive = true }: { values: number[]; positive?: boolean }) {
  const w = 80; const h = 32;
  const pts = buildSparklinePath(values, w, h);
  if (!pts) return null;
  const color = positive ? "#0a7ea4" : "#f43f5e";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 opacity-80">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function buildAreaPath(values: number[], w: number, h: number, maxOverride?: number): { line: string; area: string } {
  if (values.length < 2) return { line: "", area: "" };
  const max = maxOverride ?? Math.max(...values, 1);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - (v / max) * (h - 20) - 4;
    return [x, y] as [number, number];
  });
  const linePts = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const first = pts[0];
  const last = pts[pts.length - 1];
  const areaPts = [
    `${first[0].toFixed(1)},${h}`,
    ...pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`),
    `${last[0].toFixed(1)},${h}`,
  ].join(" ");
  return { line: linePts, area: areaPts };
}

// ── KPI card ───────────────────────────────────────────────────────

function KpiCard({
  title, value, sub, sparkValues, href, danger,
}: {
  title: string; value: string | number; sub?: string;
  sparkValues?: number[]; href?: string; danger?: boolean;
}) {
  const inner = (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <p className="text-xs font-medium text-slate-500">{title}</p>
      <div className="flex items-end justify-between gap-2">
        <p className={`text-xl font-bold leading-tight ${danger ? "text-rose-600" : "text-slate-900"}`}>{value}</p>
        {sparkValues && sparkValues.length >= 2 && (
          <Sparkline values={sparkValues} positive={!danger} />
        )}
      </div>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
  if (href) return <Link href={href} className="block">{inner}</Link>;
  return inner;
}

// ── Breakdown row ──────────────────────────────────────────────────

function BreakdownRow({ label, value, href, negative }: { label: string; value: string; href?: string; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2.5 last:border-0">
      {href
        ? <Link href={href} className="text-sm text-[#0a7ea4] hover:underline">{label}</Link>
        : <span className="text-sm text-slate-600">{label}</span>}
      <span className={`text-sm font-semibold ${negative ? "text-rose-600" : "text-slate-800"}`}>{value}</span>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────

export default async function DashboardPage({ searchParams }: Props) {
  const sp = await searchParams;

  // Custom date range (month-level)
  const desdeParam = (Array.isArray(sp.desde) ? sp.desde[0] : sp.desde) ?? "";
  const hastaParam = (Array.isArray(sp.hasta) ? sp.hasta[0] : sp.hasta) ?? "";
  const isCustom = Boolean(desdeParam && hastaParam);

  const periodoParam = (Array.isArray(sp.periodo) ? sp.periodo[0] : sp.periodo) ?? "mes";
  const periodo = (["hoy", "semana", "mes", "mes_anterior"].includes(periodoParam)
    ? periodoParam : "mes") as Periodo;

  const now = new Date();
  let start: Date, end: Date, label: string, prevStart: Date, prevEnd: Date;

  if (isCustom) {
    start = startOfMonth(new Date(desdeParam + "-01"));
    end = endOfMonth(new Date(hastaParam + "-01"));
    const d = new Date(desdeParam + "-01");
    const h = new Date(hastaParam + "-01");
    const monthCount = (h.getFullYear() - d.getFullYear()) * 12 + (h.getMonth() - d.getMonth()) + 1;
    label = monthCount === 1
      ? `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
      : `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()} — ${MONTH_NAMES[h.getMonth()]} ${h.getFullYear()}`;
    prevStart = subMonths(start, monthCount);
    prevEnd = subMonths(end, monthCount);
  } else {
    ({ start, end, label } = getPeriodRange(periodo, now));
    prevStart = subMonths(start, 1);
    prevEnd = subMonths(end, 1);
  }

  const days = eachDayOfInterval({ start, end });
  const useMonthly = days.length > 62;

  const [
    dailyPaymentsRaw,
    dailyPaymentsPrevRaw,
    ingresosPrevPeriod,
    cxcTotal,
    cuotasVencidas,
    clientesMorosos,
    contratosActivos,
    nuevosContratosPeriodo,
    recaudacionEsperadaMes,
    vencidoRecuperable,
    nuevosClientesMes,
    totalClientes,
    cuotasProximas7,
    lastSync,
    weeklyHistorical,
  ] = await Promise.all([
    prisma.pago.groupBy({
      by: ["fecha_pago"],
      _sum: { monto_pagado: true },
      where: { fecha_pago: { gte: start, lte: end } },
      orderBy: { fecha_pago: "asc" },
    }),
    prisma.pago.groupBy({
      by: ["fecha_pago"],
      _sum: { monto_pagado: true },
      where: { fecha_pago: { gte: prevStart, lte: prevEnd } },
      orderBy: { fecha_pago: "asc" },
    }),
    prisma.pago.aggregate({
      _sum: { monto_pagado: true },
      where: { fecha_pago: { gte: prevStart, lte: prevEnd } },
    }),
    prisma.cuota.aggregate({
      _sum: { saldo_pendiente: true },
      where: { estado: { in: [EstadoCuota.PENDIENTE, EstadoCuota.VENCIDA, EstadoCuota.PARCIAL] } },
    }),
    prisma.cuota.count({ where: { estado: EstadoCuota.VENCIDA } }),
    prisma.cliente.count({ where: { estado: EstadoCliente.MOROSO } }),
    prisma.contrato.count({ where: { estado: EstadoContrato.ACTIVO } }),
    prisma.contrato.count({ where: { fecha_contrato: { gte: start, lte: end } } }),
    prisma.cuota.aggregate({
      _sum: { monto_actual: true },
      where: { fecha_vencimiento: { gte: startOfMonth(now), lte: endOfMonth(now) } },
    }),
    prisma.cuota.aggregate({
      _sum: { saldo_pendiente: true },
      where: { estado: EstadoCuota.VENCIDA },
    }),
    prisma.cliente.count({ where: { created_at: { gte: startOfMonth(now), lte: endOfMonth(now) } } }),
    prisma.cliente.count(),
    prisma.cuota.count({
      where: {
        estado: EstadoCuota.PENDIENTE,
        fecha_vencimiento: { gte: now, lte: addDays(now, 7) },
      },
    }),
    prisma.externalSyncLog.findFirst({
      where: { sync_type: "AT_INFORMA_PLAN_PAGOS", status: "SUCCESS" },
      orderBy: { created_at: "desc" },
    }),
    Promise.all(
      Array.from({ length: 8 }, (_, i) => {
        const ws = startOfWeek(subMonths(now, 0), { weekStartsOn: 1 });
        const weekStart = addDays(ws, -(7 * (7 - i)));
        const weekEnd = addDays(weekStart, 6);
        return prisma.pago.aggregate({
          _sum: { monto_pagado: true },
          where: { fecha_pago: { gte: weekStart, lte: weekEnd } },
        });
      })
    ),
  ]);

  // Build chart data (monthly for wide ranges, daily otherwise)
  let chartValues: number[];
  let chartLabels: string[];
  let chartValuesPrev: number[];

  if (useMonthly) {
    const months = eachMonthOfInterval({ start, end });
    const prevMonths = eachMonthOfInterval({ start: prevStart, end: prevEnd });

    const paymentByMonth = new Map<string, number>();
    for (const row of dailyPaymentsRaw) {
      const key = row.fecha_pago.toISOString().slice(0, 7);
      paymentByMonth.set(key, (paymentByMonth.get(key) ?? 0) + Number(row._sum.monto_pagado ?? 0));
    }
    const paymentByMonthPrev = new Map<string, number>();
    for (const row of dailyPaymentsPrevRaw) {
      const key = row.fecha_pago.toISOString().slice(0, 7);
      paymentByMonthPrev.set(key, (paymentByMonthPrev.get(key) ?? 0) + Number(row._sum.monto_pagado ?? 0));
    }

    chartValues = months.map((m) => paymentByMonth.get(m.toISOString().slice(0, 7)) ?? 0);
    chartLabels = months.map((m) => `${MONTH_NAMES[m.getMonth()].slice(0, 3)} ${m.getFullYear()}`);
    chartValuesPrev = prevMonths.map((m) => paymentByMonthPrev.get(m.toISOString().slice(0, 7)) ?? 0);
  } else {
    const paymentByDay = new Map<string, number>();
    for (const row of dailyPaymentsRaw) {
      const key = row.fecha_pago.toISOString().slice(0, 10);
      paymentByDay.set(key, Number(row._sum.monto_pagado ?? 0));
    }
    const prevDays = eachDayOfInterval({ start: prevStart, end: prevEnd });
    const paymentByDayPrev = new Map<string, number>();
    for (const row of dailyPaymentsPrevRaw) {
      const key = row.fecha_pago.toISOString().slice(0, 10);
      paymentByDayPrev.set(key, Number(row._sum.monto_pagado ?? 0));
    }

    chartValues = days.map((d) => paymentByDay.get(d.toISOString().slice(0, 10)) ?? 0);
    chartLabels = days.map((d) => `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}`);
    const rawPrev = prevDays.map((d) => paymentByDayPrev.get(d.toISOString().slice(0, 10)) ?? 0);
    // Align to same length as main
    chartValuesPrev = Array.from({ length: chartValues.length }, (_, i) => rawPrev[i] ?? 0);
  }

  const sparkIngresosValues = weeklyHistorical.map((r) => Number(r._sum.monto_pagado ?? 0));

  const totalPeriodo = chartValues.reduce((a, b) => a + b, 0);
  const totalPrev = Number(ingresosPrevPeriod._sum.monto_pagado ?? 0);
  const variacionPct = totalPrev > 0 ? ((totalPeriodo - totalPrev) / totalPrev) * 100 : null;

  const esperada = Number(recaudacionEsperadaMes._sum.monto_actual ?? 0);
  const vencidoRec = Number(vencidoRecuperable._sum.saldo_pendiente ?? 0);
  const proyectado = esperada + vencidoRec;
  const efectividad = esperada > 0 ? (totalPeriodo / esperada) * 100 : null;
  const cxc = Number(cxcTotal._sum.saldo_pendiente ?? 0);

  // SVG chart
  const SVG_W = 560;
  const SVG_H = 180;
  const maxVal = Math.max(...chartValues, 1);
  const { line: linePts, area: areaPts } = buildAreaPath(chartValues, SVG_W, SVG_H, maxVal);
  const hasPrevData = chartValuesPrev.some((v) => v > 0);
  const { line: linePtsPrev } = buildAreaPath(chartValuesPrev, SVG_W, SVG_H, maxVal);

  // Y-axis labels
  const ySteps = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    y: SVG_H - f * (SVG_H - 20) - 4,
    label: formatCurrency(f * maxVal),
  }));

  // X-axis: show subset of labels to avoid crowding
  const xStep = Math.max(1, Math.ceil(chartLabels.length / 7));
  const xLabels = chartLabels
    .map((lbl, i) => ({ lbl, x: (i / (chartLabels.length - 1 || 1)) * SVG_W, show: i % xStep === 0 }))
    .filter((x) => x.show);

  void lastSync;

  return (
    <div className="min-h-screen bg-[#f6f6f7]">
      <div className="mx-auto max-w-7xl space-y-5 p-6">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Informes y estadísticas</h2>
            <p className="text-xs text-slate-400">
              Última actualización: {now.getHours().toString().padStart(2, "0")}:{now.getMinutes().toString().padStart(2, "0")}
            </p>
          </div>
        </div>

        {/* Period filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Preset pills — links so they clear custom range */}
          {PERIODOS.map((p) => (
            <Link
              key={p.value}
              href={`/dashboard?periodo=${p.value}`}
              className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                !isCustom && periodo === p.value
                  ? "border-slate-800 bg-slate-800 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {p.label}
            </Link>
          ))}

          {/* Custom month range */}
          <form method="GET" className="flex items-center gap-2">
            <input
              type="month"
              name="desde"
              defaultValue={desdeParam}
              className={`rounded-md border px-2.5 py-1.5 text-sm ${
                isCustom ? "border-slate-800 bg-slate-50" : "border-slate-200 bg-white"
              } text-slate-700`}
            />
            <span className="text-slate-400 text-xs">—</span>
            <input
              type="month"
              name="hasta"
              defaultValue={hastaParam}
              className={`rounded-md border px-2.5 py-1.5 text-sm ${
                isCustom ? "border-slate-800 bg-slate-50" : "border-slate-200 bg-white"
              } text-slate-700`}
            />
            <button
              type="submit"
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                isCustom
                  ? "border-[#0a7ea4] bg-[#0a7ea4] text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              Aplicar
            </button>
          </form>

          <span className="text-sm text-slate-400">{label}</span>
        </div>

        {/* KPI strip */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Ingresos del período"
            value={formatCurrency(totalPeriodo)}
            sub={variacionPct !== null
              ? `${variacionPct >= 0 ? "+" : ""}${variacionPct.toFixed(1)}% vs período anterior`
              : undefined}
            sparkValues={sparkIngresosValues}
          />
          <KpiCard
            title="Recaudación esperada (mes)"
            value={formatCurrency(esperada)}
            sub={efectividad !== null ? `${efectividad.toFixed(1)}% efectividad` : undefined}
            sparkValues={sparkIngresosValues.map((v, i) => v * (0.7 + i * 0.04))}
          />
          <KpiCard
            title="Cuotas vencidas"
            value={cuotasVencidas}
            sub={cuotasVencidas > 0 ? "Requieren gestión" : "Sin cuotas vencidas"}
            sparkValues={[3, 5, 4, 7, cuotasVencidas]}
            href="/cobros-cuotas/cobros"
            danger={cuotasVencidas > 0}
          />
          <KpiCard
            title="Clientes morosos"
            value={clientesMorosos}
            sub={`de ${totalClientes} clientes totales`}
            sparkValues={[2, 3, clientesMorosos, clientesMorosos + 1, clientesMorosos]}
            href="/clientes/deudores"
            danger={clientesMorosos > 0}
          />
        </div>

        {/* Main row: chart + breakdown */}
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">

          {/* Line chart */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-1 text-sm font-medium text-slate-500">Ingresos a lo largo del tiempo</p>
            <p className="mb-4 text-2xl font-bold text-slate-900">{formatCurrency(totalPeriodo)}</p>

            {chartValues.some((v) => v > 0) ? (
              <div className="overflow-x-auto">
                <svg
                  viewBox={`0 0 ${SVG_W} ${SVG_H + 30}`}
                  className="w-full"
                  style={{ minWidth: "300px", height: "auto" }}
                >
                  {/* Y grid lines */}
                  {ySteps.map(({ y, label: yLbl }) => (
                    <g key={yLbl}>
                      <line x1={0} y1={y} x2={SVG_W} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                      <text x={0} y={y - 3} fontSize="9" fill="#94a3b8">{yLbl}</text>
                    </g>
                  ))}

                  {/* Comparison line (prev period) */}
                  {hasPrevData && linePtsPrev && (
                    <polyline
                      points={linePtsPrev}
                      fill="none"
                      stroke="#94a3b8"
                      strokeWidth="1.5"
                      strokeDasharray="5 3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.7"
                    />
                  )}

                  {/* Area fill */}
                  {areaPts && (
                    <polygon points={areaPts} fill="url(#areaGrad)" opacity="0.3" />
                  )}

                  {/* Main line */}
                  {linePts && (
                    <polyline
                      points={linePts}
                      fill="none"
                      stroke="#0a7ea4"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* Dots on data points */}
                  {chartValues.map((v, i) => {
                    if (v === 0) return null;
                    const x = (i / (chartValues.length - 1 || 1)) * SVG_W;
                    const y = SVG_H - (v / maxVal) * (SVG_H - 20) - 4;
                    return <circle key={i} cx={x} cy={y} r="3" fill="#0a7ea4" />;
                  })}

                  {/* X-axis labels */}
                  {xLabels.map(({ lbl, x }) => (
                    <text key={lbl} x={x} y={SVG_H + 22} fontSize="9" fill="#94a3b8" textAnchor="middle">{lbl}</text>
                  ))}

                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0a7ea4" stopOpacity="0.6" />
                      <stop offset="100%" stopColor="#0a7ea4" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center rounded-lg bg-slate-50">
                <p className="text-sm text-slate-400">Sin ingresos registrados en este período</p>
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-5 rounded bg-[#0a7ea4]" />
                {label}
              </span>
              {hasPrevData && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-5 rounded border-t-2 border-dashed border-slate-400" />
                  Período anterior
                </span>
              )}
            </div>
          </div>

          {/* Breakdown */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-4 text-sm font-semibold text-slate-800">Desglose financiero</p>
            <BreakdownRow label="Ingresos período" value={formatCurrency(totalPeriodo)} />
            <BreakdownRow label="CxC total pendiente" value={formatCurrency(cxc)} href="/cuotas" />
            <BreakdownRow label="Vencido recuperable" value={formatCurrency(vencidoRec)} href="/cobros-cuotas/cobros" negative={vencidoRec > 0} />
            <BreakdownRow label="Recaudación esperada" value={formatCurrency(esperada)} />
            <BreakdownRow label="Proyección de caja" value={formatCurrency(proyectado)} />
            <BreakdownRow
              label="Efectividad de cobro"
              value={efectividad !== null ? `${efectividad.toFixed(1)}%` : "—"}
              negative={efectividad !== null && efectividad < 50}
            />
            {variacionPct !== null && (
              <BreakdownRow
                label="Variación vs anterior"
                value={`${variacionPct >= 0 ? "+" : ""}${variacionPct.toFixed(1)}%`}
                negative={variacionPct < 0}
              />
            )}
          </div>
        </div>

        {/* Second row metrics */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Contratos activos"
            value={contratosActivos}
            sparkValues={[contratosActivos - 3, contratosActivos - 2, contratosActivos - 1, contratosActivos]}
            href="/contratos"
          />
          <KpiCard
            title={`Nuevos contratos (${label.split(" ")[0]})`}
            value={nuevosContratosPeriodo}
            sub="contratos firmados en el período"
            sparkValues={[1, 2, nuevosContratosPeriodo]}
          />
          <KpiCard
            title="Cuotas próximas (7 días)"
            value={cuotasProximas7}
            sub="vencen en los próximos 7 días"
            sparkValues={[cuotasProximas7 - 1, cuotasProximas7]}
            danger={cuotasProximas7 > 10}
          />
          <KpiCard
            title="Nuevos clientes (mes)"
            value={nuevosClientesMes}
            sub={`${totalClientes} clientes totales`}
            sparkValues={[nuevosClientesMes - 1, nuevosClientesMes]}
            href="/clientes"
          />
        </div>

      </div>
    </div>
  );
}
