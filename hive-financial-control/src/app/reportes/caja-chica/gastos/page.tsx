import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import Link from "next/link";

export default async function ReporteCajaCHicaGastosPage({ searchParams }: { searchParams: { fondo_id?: string; desde?: string; hasta?: string } }) {
  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const desde = searchParams.desde ? new Date(searchParams.desde) : inicioMes;
  const hasta = searchParams.hasta ? new Date(searchParams.hasta + "T23:59:59") : new Date(hoy.toISOString().slice(0, 10) + "T23:59:59");
  const fondoId = searchParams.fondo_id ? Number(searchParams.fondo_id) : undefined;

  const [gastos, fondos, porCategoria] = await Promise.all([
    prisma.gastoCajaChica.findMany({
      where: {
        fecha_gasto: { gte: desde, lte: hasta },
        ...(fondoId ? { fondo_id: fondoId } : {}),
      },
      include: {
        fondo: { select: { nombre: true } },
        responsable: { select: { nombre: true } },
      },
      orderBy: { fecha_gasto: "desc" },
    }),
    prisma.fondoCajaChica.findMany({ where: { activo: true }, select: { id: true, nombre: true } }),
    prisma.gastoCajaChica.groupBy({
      by: ["categoria"],
      _sum: { monto: true },
      _count: { id: true },
      where: {
        fecha_gasto: { gte: desde, lte: hasta },
        ...(fondoId ? { fondo_id: fondoId } : {}),
      },
      orderBy: { _sum: { monto: "desc" } },
    }),
  ]);

  const total = gastos.reduce((s, g) => s + Number(g.monto), 0);

  return (
    <section className="space-y-6">
      <header>
        <Link href="/reportes" className="text-xs text-[var(--muted)] hover:underline">← Reportes</Link>
        <h2 className="mt-1 text-2xl font-semibold">Gastos de caja chica</h2>
        <p className="text-sm text-[var(--muted)]">Desglose por fondo y categoría</p>
      </header>

      <form method="get" className="card p-4 flex gap-4 flex-wrap">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Fondo</label>
          <select name="fondo_id" defaultValue={fondoId ?? ""}
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
            <option value="">Todos</option>
            {fondos.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </select>
        </div>
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Total gastos ({gastos.length})</p>
          <p className="mt-1 text-2xl font-bold">{formatCurrency(total)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-[var(--muted)] mb-2">Por categoría</p>
          <div className="space-y-1">
            {porCategoria.slice(0, 6).map(c => (
              <div key={c.categoria} className="flex items-center justify-between text-sm">
                <span>{c.categoria}</span>
                <span className="font-semibold">{formatCurrency(Number(c._sum.monto ?? 0))}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Fecha</th>
              <th className="table-cell text-left font-medium">Fondo</th>
              <th className="table-cell text-left font-medium">Categoría</th>
              <th className="table-cell text-left font-medium">Descripción</th>
              <th className="table-cell text-left font-medium">Responsable</th>
              <th className="table-cell text-right font-medium">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {gastos.map(g => (
              <tr key={g.id} className="hover:bg-slate-50">
                <td className="table-cell">{formatDate(g.fecha_gasto)}</td>
                <td className="table-cell text-[var(--muted)]">{g.fondo.nombre}</td>
                <td className="table-cell text-xs">{g.categoria}</td>
                <td className="table-cell">{g.descripcion}</td>
                <td className="table-cell text-[var(--muted)]">{g.responsable.nombre}</td>
                <td className="table-cell text-right font-semibold">{formatCurrency(Number(g.monto))}</td>
              </tr>
            ))}
            {gastos.length === 0 && <tr><td colSpan={6} className="table-cell text-center text-[var(--muted)]">Sin gastos</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
