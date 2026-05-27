import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";

export default async function BiRentabilidadPage() {
  const hoy = new Date();
  const inicioAnio = new Date(hoy.getFullYear(), 0, 1);

  const [ingresos, costos, gastos, cxp] = await Promise.all([
    prisma.documentoVenta.aggregate({
      _sum: { monto_neto: true },
      where: { estado: "PAGADO", fecha_emision: { gte: inicioAnio } },
    }),
    prisma.gastoCompra.aggregate({
      _sum: { monto_total: true },
      where: { fecha_gasto: { gte: inicioAnio } },
    }),
    prisma.honorarioRecibido.aggregate({
      _sum: { monto_neto: true },
      where: { fecha_emision: { gte: inicioAnio } },
    }),
    prisma.cuentaPorPagar.aggregate({ _sum: { monto: true }, where: { estado: "PAGADA", fecha_pago: { gte: inicioAnio } } }),
  ]);

  const ingresosVal = Number(ingresos._sum.monto_neto ?? 0);
  const gastosVal = Number(costos._sum.monto_total ?? 0) + Number(gastos._sum.monto_neto ?? 0);
  const utilidad = ingresosVal - gastosVal;
  const margen = ingresosVal > 0 ? (utilidad / ingresosVal) * 100 : 0;

  const ingresosPorServicio = await prisma.documentoVenta.groupBy({
    by: ["tipo"],
    _sum: { monto_neto: true },
    where: { estado: "PAGADO", fecha_emision: { gte: inicioAnio } },
    orderBy: { _sum: { monto_neto: "desc" } },
  });

  return (
    <section className="space-y-6">
      <header>
        <Link href="/bi" className="text-xs text-[var(--muted)] hover:underline">← BI</Link>
        <h2 className="text-2xl font-semibold mt-1">Rentabilidad</h2>
        <p className="text-sm text-[var(--muted)]">Año {hoy.getFullYear()} (acumulado)</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card p-4 bg-emerald-50">
          <p className="text-xs text-emerald-600">Ingresos netos</p>
          <p className="mt-1 text-xl font-bold text-emerald-700">{formatCurrency(ingresosVal)}</p>
        </div>
        <div className="card p-4 bg-amber-50">
          <p className="text-xs text-amber-600">Costos + Gastos</p>
          <p className="mt-1 text-xl font-bold text-amber-700">{formatCurrency(gastosVal)}</p>
        </div>
        <div className={`card p-4 ${utilidad >= 0 ? "bg-blue-50" : "bg-rose-50"}`}>
          <p className={`text-xs ${utilidad >= 0 ? "text-blue-600" : "text-rose-600"}`}>Utilidad</p>
          <p className={`mt-1 text-xl font-bold ${utilidad >= 0 ? "text-blue-700" : "text-rose-700"}`}>{formatCurrency(utilidad)}</p>
        </div>
        <div className={`card p-4 ${margen >= 20 ? "bg-emerald-50" : margen >= 0 ? "bg-amber-50" : "bg-rose-50"}`}>
          <p className="text-xs text-[var(--muted)]">Margen</p>
          <p className={`mt-1 text-xl font-bold ${margen >= 20 ? "text-emerald-700" : margen >= 0 ? "text-amber-700" : "text-rose-700"}`}>{margen.toFixed(1)}%</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="font-semibold text-sm">Ingresos por tipo de documento</h3>
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-[var(--border)]">
            {ingresosPorServicio.map(s => (
              <tr key={s.tipo} className="hover:bg-slate-50">
                <td className="table-cell font-medium">{s.tipo.replace(/_/g, " ")}</td>
                <td className="table-cell text-right font-semibold">{formatCurrency(Number(s._sum.monto_neto ?? 0))}</td>
                <td className="table-cell text-right text-xs text-[var(--muted)]">
                  {ingresosVal > 0 ? ((Number(s._sum.monto_neto ?? 0) / ingresosVal) * 100).toFixed(1) : 0}%
                </td>
              </tr>
            ))}
            {ingresosPorServicio.length === 0 && <tr><td colSpan={3} className="table-cell text-center text-[var(--muted)]">Sin datos.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
