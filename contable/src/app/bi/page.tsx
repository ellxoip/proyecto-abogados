import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import BiCharts from "./BiCharts";

async function getMonthlyData() {
  const months = 6;
  const now = new Date();
  const data = [];
  for (let i = months - 1; i >= 0; i--) {
    const desde = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const hasta = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const [ingresos, gastos] = await Promise.all([
      prisma.documentoVenta.aggregate({ _sum: { monto_total: true }, where: { estado: "PAGADO", fecha_emision: { gte: desde, lte: hasta } } }),
      prisma.gastoCompra.aggregate({ _sum: { monto_total: true }, where: { fecha_gasto: { gte: desde, lte: hasta } } }),
    ]);
    data.push({
      mes: desde.toLocaleDateString("es-CL", { month: "short", year: "2-digit" }),
      ingresos: Number(ingresos._sum.monto_total ?? 0),
      gastos: Number(gastos._sum.monto_total ?? 0),
    });
  }
  return data;
}

export default async function BiPage() {
  const [
    clientesTotal, clientesActivos,
    contratosActivos,
    cuotasPendientes, cuotasVencidas,
    docVentas, gastoMes, cxpTotal,
  ] = await Promise.all([
    prisma.cliente.count(),
    prisma.cliente.count({ where: { estado: "ACTIVO" } }),
    prisma.contrato.count({ where: { estado: "ACTIVO" } }),
    prisma.cuota.aggregate({ _sum: { saldo_pendiente: true }, where: { estado: { in: ["PENDIENTE", "PARCIAL"] } } }),
    prisma.cuota.aggregate({ _sum: { saldo_pendiente: true }, where: { estado: "VENCIDA" } }),
    prisma.documentoVenta.aggregate({ _sum: { monto_total: true }, where: { estado: { in: ["EMITIDO", "ACEPTADO_SII"] } } }),
    prisma.gastoCompra.aggregate({ _sum: { monto_total: true }, where: { fecha_gasto: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }),
    prisma.cuentaPorPagar.aggregate({ _sum: { monto: true }, where: { estado: { in: ["PENDIENTE", "VENCIDA"] } } }),
  ]);

  const monthlyData = await getMonthlyData();

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">BI y análisis ejecutivo</h2>
        <p className="text-sm text-[var(--muted)]">Visión consolidada del desempeño financiero y operacional</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Clientes activos</p>
          <p className="mt-1 text-2xl font-bold">{clientesActivos}</p>
          <p className="text-xs text-[var(--muted)] mt-0.5">de {clientesTotal} totales</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Contratos vigentes</p>
          <p className="mt-1 text-2xl font-bold">{contratosActivos}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Cartera pendiente</p>
          <p className="mt-1 text-2xl font-bold">{formatCurrency(Number(cuotasPendientes._sum.saldo_pendiente ?? 0))}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Cartera vencida</p>
          <p className="mt-1 text-2xl font-bold text-rose-600">{formatCurrency(Number(cuotasVencidas._sum.saldo_pendiente ?? 0))}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Por cobrar (facturas)</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{formatCurrency(Number(docVentas._sum.monto_total ?? 0))}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Gastos del mes</p>
          <p className="mt-1 text-2xl font-bold">{formatCurrency(Number(gastoMes._sum.monto_total ?? 0))}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">CxP pendiente</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{formatCurrency(Number(cxpTotal._sum.monto ?? 0))}</p>
        </div>
      </div>

      <BiCharts monthlyData={monthlyData} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/bi/cobranza" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Análisis de cobranza</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Mora, eficiencia y cartera</p>
        </Link>
        <Link href="/bi/financieros" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Indicadores financieros</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Liquidez, rentabilidad, solvencia</p>
        </Link>
        <Link href="/bi/clientes" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Análisis de clientes</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Ranking y segmentación</p>
        </Link>
        <Link href="/bi/contratos" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Contratos</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Vigentes, vencidos y próximos</p>
        </Link>
        <Link href="/bi/abogados" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Rendimiento abogados</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Causas y recuperación</p>
        </Link>
        <Link href="/bi/rentabilidad" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Rentabilidad</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Margen por cliente y servicio</p>
        </Link>
      </div>
    </section>
  );
}
