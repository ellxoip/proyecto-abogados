import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";

export default async function ReporteFlujoCajaPage({ searchParams }: { searchParams: { desde?: string; hasta?: string } }) {
  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const desde = searchParams.desde ? new Date(searchParams.desde) : inicioMes;
  const hasta = searchParams.hasta ? new Date(searchParams.hasta + "T23:59:59") : new Date(hoy.toISOString().slice(0, 10) + "T23:59:59");

  const [ingresos, egresos] = await Promise.all([
    prisma.movimientoTesoreria.findMany({
      where: { tipo: "INGRESO", fecha_movimiento: { gte: desde, lte: hasta } },
      include: { cuenta: { select: { nombre: true } } },
      orderBy: { fecha_movimiento: "asc" },
    }),
    prisma.movimientoTesoreria.findMany({
      where: { tipo: "EGRESO", fecha_movimiento: { gte: desde, lte: hasta } },
      include: { cuenta: { select: { nombre: true } } },
      orderBy: { fecha_movimiento: "asc" },
    }),
  ]);

  const totalIngresos = ingresos.reduce((s, m) => s + Number(m.monto), 0);
  const totalEgresos = egresos.reduce((s, m) => s + Number(m.monto), 0);
  const flujoNeto = totalIngresos - totalEgresos;

  const todos = [...ingresos.map(m => ({ ...m, signo: 1 })), ...egresos.map(m => ({ ...m, signo: -1 }))];
  todos.sort((a, b) => new Date(a.fecha_movimiento).getTime() - new Date(b.fecha_movimiento).getTime());

  return (
    <section className="space-y-6">
      <header>
        <Link href="/reportes" className="text-xs text-[var(--muted)] hover:underline">← Reportes</Link>
        <h2 className="mt-1 text-2xl font-semibold">Flujo de caja real</h2>
        <p className="text-sm text-[var(--muted)]">Ingresos y egresos efectivos del período</p>
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

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4 bg-emerald-50">
          <p className="text-xs text-emerald-600">Ingresos</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{formatCurrency(totalIngresos)}</p>
          <p className="text-xs text-emerald-600 mt-1">{ingresos.length} movimientos</p>
        </div>
        <div className="card p-4 bg-rose-50">
          <p className="text-xs text-rose-600">Egresos</p>
          <p className="mt-1 text-2xl font-bold text-rose-700">{formatCurrency(totalEgresos)}</p>
          <p className="text-xs text-rose-600 mt-1">{egresos.length} movimientos</p>
        </div>
        <div className={`card p-4 ${flujoNeto >= 0 ? "bg-blue-50" : "bg-amber-50"}`}>
          <p className={`text-xs ${flujoNeto >= 0 ? "text-blue-600" : "text-amber-600"}`}>Flujo neto</p>
          <p className={`mt-1 text-2xl font-bold ${flujoNeto >= 0 ? "text-blue-700" : "text-amber-700"}`}>{formatCurrency(flujoNeto)}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="font-semibold text-sm">Movimientos cronológicos</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Fecha</th>
              <th className="table-cell text-left font-medium">Tipo</th>
              <th className="table-cell text-left font-medium">Descripción</th>
              <th className="table-cell text-left font-medium">Cuenta</th>
              <th className="table-cell text-left font-medium">Categoría</th>
              <th className="table-cell text-right font-medium">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {todos.map(m => (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="table-cell">{new Date(m.fecha_movimiento).toLocaleDateString("es-CL")}</td>
                <td className="table-cell">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${m.tipo === "INGRESO" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                    {m.tipo}
                  </span>
                </td>
                <td className="table-cell">{m.descripcion}</td>
                <td className="table-cell text-[var(--muted)]">{m.cuenta.nombre}</td>
                <td className="table-cell text-[var(--muted)]">{m.categoria ?? "—"}</td>
                <td className={`table-cell text-right font-semibold ${m.signo > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {m.signo > 0 ? "+" : "-"}{formatCurrency(Number(m.monto))}
                </td>
              </tr>
            ))}
            {todos.length === 0 && <tr><td colSpan={6} className="table-cell text-center text-[var(--muted)]">Sin movimientos</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
