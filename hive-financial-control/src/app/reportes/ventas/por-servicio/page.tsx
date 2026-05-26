import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";

export default async function ReporteVentasPorServicioPage({ searchParams }: { searchParams: { desde?: string; hasta?: string } }) {
  const hoy = new Date();
  const inicioAnio = new Date(hoy.getFullYear(), 0, 1);
  const desde = searchParams.desde ? new Date(searchParams.desde) : inicioAnio;
  const hasta = searchParams.hasta ? new Date(searchParams.hasta + "T23:59:59") : new Date(hoy.toISOString().slice(0, 10) + "T23:59:59");

  const porServicio = await prisma.documentoVenta.groupBy({
    by: ["servicio_id"],
    _sum: { monto_neto: true, monto_total: true },
    _count: { id: true },
    where: { fecha_emision: { gte: desde, lte: hasta }, estado: { not: "ANULADO" } },
    orderBy: { _sum: { monto_neto: "desc" } },
  });

  const servicioIds = porServicio.map(p => p.servicio_id).filter(Boolean) as number[];
  const servicios = await prisma.servicio.findMany({ where: { id: { in: servicioIds } }, select: { id: true, nombre: true } });
  const servicioMap = Object.fromEntries(servicios.map(s => [s.id, s.nombre]));

  const totalNeto = porServicio.reduce((s, p) => s + Number(p._sum.monto_neto ?? 0), 0);

  return (
    <section className="space-y-6">
      <header>
        <Link href="/reportes" className="text-xs text-[var(--muted)] hover:underline">← Reportes</Link>
        <h2 className="mt-1 text-2xl font-semibold">Venta por servicio</h2>
        <p className="text-sm text-[var(--muted)]">Ingresos agrupados por tipo de servicio</p>
      </header>

      <form method="get" className="card p-4 flex gap-4 flex-wrap">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Desde</label>
          <input type="date" name="desde" defaultValue={desde.toISOString().slice(0, 10)}
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Hasta</label>
          <input type="date" name="hasta" defaultValue={hasta.toISOString().slice(0, 10)}
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
        </div>
        <div className="flex items-end">
          <button type="submit" className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">Filtrar</button>
        </div>
      </form>

      <div className="card p-4">
        <p className="text-xs text-[var(--muted)]">Total neto período</p>
        <p className="mt-1 text-2xl font-bold text-emerald-600">{formatCurrency(totalNeto)}</p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Servicio</th>
              <th className="table-cell text-center font-medium">Documentos</th>
              <th className="table-cell text-right font-medium">Monto neto</th>
              <th className="table-cell text-right font-medium">Monto total</th>
              <th className="table-cell text-right font-medium">% del total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {porServicio.map(p => {
              const neto = Number(p._sum.monto_neto ?? 0);
              return (
                <tr key={p.servicio_id ?? "sin"} className="hover:bg-slate-50">
                  <td className="table-cell font-medium">
                    {p.servicio_id ? (servicioMap[p.servicio_id] ?? "Servicio eliminado") : "Sin servicio"}
                  </td>
                  <td className="table-cell text-center">{p._count.id}</td>
                  <td className="table-cell text-right">{formatCurrency(neto)}</td>
                  <td className="table-cell text-right">{formatCurrency(Number(p._sum.monto_total ?? 0))}</td>
                  <td className="table-cell text-right text-[var(--muted)]">
                    {totalNeto > 0 ? ((neto / totalNeto) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
              );
            })}
            {porServicio.length === 0 && <tr><td colSpan={5} className="table-cell text-center text-[var(--muted)]">Sin datos</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
