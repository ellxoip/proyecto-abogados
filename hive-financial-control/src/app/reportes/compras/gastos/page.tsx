import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import Link from "next/link";

export default async function ReporteComprasGastosPage({ searchParams }: { searchParams: { desde?: string; hasta?: string; categoria?: string } }) {
  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const desde = searchParams.desde ? new Date(searchParams.desde) : inicioMes;
  const hasta = searchParams.hasta ? new Date(searchParams.hasta + "T23:59:59") : new Date(hoy.toISOString().slice(0, 10) + "T23:59:59");

  const [gastos, porCategoria] = await Promise.all([
    prisma.gastoCompra.findMany({
      where: {
        fecha_gasto: { gte: desde, lte: hasta },
        ...(searchParams.categoria ? { categoria: searchParams.categoria } : {}),
      },
      include: { proveedor: { select: { nombre: true } } },
      orderBy: { fecha_gasto: "desc" },
    }),
    prisma.gastoCompra.groupBy({
      by: ["categoria"],
      _sum: { monto_total: true },
      _count: { id: true },
      where: { fecha_gasto: { gte: desde, lte: hasta } },
      orderBy: { _sum: { monto_total: "desc" } },
    }),
  ]);

  const total = gastos.reduce((s, g) => s + Number(g.monto_total), 0);
  const categorias = [...new Set(gastos.map(g => g.categoria))].sort();

  return (
    <section className="space-y-6">
      <header>
        <Link href="/reportes" className="text-xs text-[var(--muted)] hover:underline">← Reportes</Link>
        <h2 className="mt-1 text-2xl font-semibold">Gastos por categoría</h2>
        <p className="text-sm text-[var(--muted)]">Desglose de gastos operacionales</p>
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
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Categoría</label>
          <select name="categoria" defaultValue={searchParams.categoria ?? ""}
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
            <option value="">Todas</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button type="submit" className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">Filtrar</button>
        </div>
      </form>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Total gastos ({gastos.length})</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{formatCurrency(total)}</p>
        </div>
        <div className="card p-4 space-y-2">
          <p className="text-xs font-medium text-[var(--muted)]">Por categoría</p>
          {porCategoria.slice(0, 5).map(p => (
            <div key={p.categoria} className="flex items-center justify-between text-sm">
              <span>{p.categoria}</span>
              <span className="font-semibold">{formatCurrency(Number(p._sum.monto_total ?? 0))}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Fecha</th>
              <th className="table-cell text-left font-medium">Categoría</th>
              <th className="table-cell text-left font-medium">Descripción</th>
              <th className="table-cell text-left font-medium">Proveedor</th>
              <th className="table-cell text-right font-medium">Monto</th>
              <th className="table-cell text-left font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {gastos.map(g => (
              <tr key={g.id} className="hover:bg-slate-50">
                <td className="table-cell">{formatDate(g.fecha_gasto)}</td>
                <td className="table-cell text-xs">{g.categoria}</td>
                <td className="table-cell text-[var(--muted)]">{g.descripcion}</td>
                <td className="table-cell">{g.proveedor?.nombre ?? "—"}</td>
                <td className="table-cell text-right font-semibold">{formatCurrency(Number(g.monto_total))}</td>
                <td className="table-cell">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${g.estado_pago === "PAGADO" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {g.estado_pago}
                  </span>
                </td>
              </tr>
            ))}
            {gastos.length === 0 && <tr><td colSpan={6} className="table-cell text-center text-[var(--muted)]">Sin gastos</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
