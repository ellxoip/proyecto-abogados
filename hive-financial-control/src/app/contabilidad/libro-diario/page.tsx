import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";

export default async function LibroDiarioPage({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  const sp = await searchParams;
  const desde = sp.desde ? new Date(sp.desde) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const hasta = sp.hasta ? new Date(sp.hasta) : new Date();

  const comprobantes = await prisma.comprobanteContable.findMany({
    where: { estado: "APROBADO", fecha_comprobante: { gte: desde, lte: hasta } },
    include: {
      tipo: { select: { nombre: true, prefijo: true } },
      partidas: { include: { cuenta: { select: { codigo: true, nombre: true } } }, orderBy: { tipo: "desc" } },
    },
    orderBy: [{ fecha_comprobante: "asc" }, { numero: "asc" }],
  });

  const totalDebe = comprobantes.reduce((s, c) => s + Number(c.total_debe), 0);

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Libro diario</h2>
          <p className="text-sm text-[var(--muted)]">Movimientos contables en orden cronológico</p>
        </div>
        <form className="flex gap-2 items-end" method="GET">
          <div>
            <label className="block text-xs text-[var(--muted)] mb-1">Desde</label>
            <input type="date" name="desde" defaultValue={desde.toISOString().slice(0, 10)} className="rounded border border-[var(--border)] px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-[var(--muted)] mb-1">Hasta</label>
            <input type="date" name="hasta" defaultValue={hasta.toISOString().slice(0, 10)} className="rounded border border-[var(--border)] px-3 py-1.5 text-sm" />
          </div>
          <button type="submit" className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">Filtrar</button>
        </form>
      </header>

      <div className="card p-4 flex gap-6 text-sm">
        <span className="text-[var(--muted)]">Comprobantes: <strong>{comprobantes.length}</strong></span>
        <span className="text-[var(--muted)]">Total movimientos: <strong>{formatCurrency(totalDebe)}</strong></span>
      </div>

      <div className="space-y-4">
        {comprobantes.map(c => (
          <div key={c.id} className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-[var(--border)]">
              <div className="flex gap-3 items-center">
                <span className="font-mono text-sm font-medium">{c.tipo.prefijo ?? ""}{c.numero}</span>
                <span className="text-xs text-[var(--muted)]">{c.tipo.nombre}</span>
                <span className="text-sm">{formatDate(c.fecha_comprobante)}</span>
              </div>
              <span className="text-sm text-[var(--muted)]">{c.descripcion}</span>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-[var(--border)]">
                {c.partidas.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="table-cell font-mono text-xs text-[var(--muted)]">{p.cuenta.codigo}</td>
                    <td className="table-cell">{p.cuenta.nombre}</td>
                    <td className="table-cell text-[var(--muted)]">{p.glosa ?? ""}</td>
                    <td className="table-cell text-right">{p.tipo === "DEBE" ? formatCurrency(Number(p.monto)) : ""}</td>
                    <td className="table-cell text-right">{p.tipo === "HABER" ? formatCurrency(Number(p.monto)) : ""}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold text-sm">
                  <td colSpan={3} className="table-cell text-right text-[var(--muted)]">Totales</td>
                  <td className="table-cell text-right">{formatCurrency(Number(c.total_debe))}</td>
                  <td className="table-cell text-right">{formatCurrency(Number(c.total_haber))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}
        {comprobantes.length === 0 && (
          <div className="card p-8 text-center text-sm text-[var(--muted)]">Sin comprobantes contabilizados en el período.</div>
        )}
      </div>
    </section>
  );
}
