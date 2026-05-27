import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";

export default async function ReporteRendicionesPage({ searchParams }: { searchParams: { fondo_id?: string; estado?: string } }) {
  const fondoId = searchParams.fondo_id ? Number(searchParams.fondo_id) : undefined;
  const estado = searchParams.estado;

  const [rendiciones, fondos] = await Promise.all([
    prisma.rendicionCajaChica.findMany({
      where: {
        ...(fondoId ? { fondo_id: fondoId } : {}),
        ...(estado ? { estado: estado as never } : { estado: "APROBADA" }),
      },
      include: {
        fondo: { select: { nombre: true } },
        aprobador: { select: { nombre: true } },
        gastos: { select: { monto: true, categoria: true } },
      },
      orderBy: { created_at: "desc" },
    }),
    prisma.fondoCajaChica.findMany({ where: { activo: true }, select: { id: true, nombre: true } }),
  ]);

  const total = rendiciones.reduce((s, r) => s + Number(r.total_gastos), 0);

  return (
    <section className="space-y-6">
      <header>
        <Link href="/reportes" className="text-xs text-[var(--muted)] hover:underline">← Reportes</Link>
        <h2 className="mt-1 text-2xl font-semibold">Rendiciones de caja chica</h2>
        <p className="text-sm text-[var(--muted)]">Resumen de rendiciones por fondo y período</p>
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
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Estado</label>
          <select name="estado" defaultValue={estado ?? "APROBADA"}
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
            {["BORRADOR","ENVIADA","APROBADA","RECHAZADA"].map(e => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button type="submit" className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">Filtrar</button>
        </div>
      </form>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Total rendido ({rendiciones.length} rendiciones)</p>
          <p className="mt-1 text-2xl font-bold">{formatCurrency(total)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Promedio por rendición</p>
          <p className="mt-1 text-2xl font-bold">{formatCurrency(rendiciones.length > 0 ? total / rendiciones.length : 0)}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Fondo</th>
              <th className="table-cell text-left font-medium">Período</th>
              <th className="table-cell text-center font-medium">Gastos</th>
              <th className="table-cell text-right font-medium">Total</th>
              <th className="table-cell text-left font-medium">Aprobado por</th>
              <th className="table-cell text-left font-medium">Estado</th>
              <th className="table-cell text-left font-medium">Observaciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rendiciones.map(r => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="table-cell font-medium">{r.fondo.nombre}</td>
                <td className="table-cell">{r.periodo}</td>
                <td className="table-cell text-center">{r.gastos.length}</td>
                <td className="table-cell text-right font-semibold">{formatCurrency(Number(r.total_gastos))}</td>
                <td className="table-cell text-[var(--muted)]">{r.aprobador?.nombre ?? "—"}</td>
                <td className="table-cell">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${r.estado === "APROBADA" ? "bg-emerald-50 text-emerald-700" : r.estado === "RECHAZADA" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>
                    {r.estado}
                  </span>
                </td>
                <td className="table-cell text-[var(--muted)] text-xs">{r.observaciones ?? "—"}</td>
              </tr>
            ))}
            {rendiciones.length === 0 && <tr><td colSpan={7} className="table-cell text-center text-[var(--muted)]">Sin rendiciones</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
