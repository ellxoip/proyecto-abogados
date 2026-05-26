import { formatCurrency } from "@/lib/format";
import { reportEfectividadCobranza } from "@/server/reports/new-reports";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function asValue(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function EfectividadCobranzaPage({ searchParams }: Props) {
  const sp = await searchParams;
  const from = asValue(sp.from);
  const to = asValue(sp.to);

  const { rows, summary } = await reportEfectividadCobranza({
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">Efectividad de cobranza</h2>
        <p className="text-sm text-[var(--muted)]">Gestiones realizadas vs pagos confirmados por período</p>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Total gestiones</p>
          <p className="mt-1 text-xl font-semibold">{summary.totalGestiones}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Pagos cobrados</p>
          <p className="mt-1 text-xl font-semibold">{summary.totalCobradas}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Tasa global</p>
          <p className="mt-1 text-xl font-semibold">{summary.tasaGlobal}%</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Monto cobrado</p>
          <p className="mt-1 text-xl font-semibold">{formatCurrency(summary.totalMonto)}</p>
        </div>
      </div>

      <form className="card grid gap-3 p-4 md:grid-cols-3" method="GET">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--muted)]">Desde</label>
          <input name="from" type="date" defaultValue={from} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--muted)]">Hasta</label>
          <input name="to" type="date" defaultValue={to} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
        </div>
        <div className="flex items-end gap-2">
          <button className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white" type="submit">
            Filtrar
          </button>
          {(from || to) && (
            <a href="/reportes/efectividad-cobranza" className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)]">
              Limpiar
            </a>
          )}
        </div>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--muted)]">
            <tr>
              <th className="table-cell font-medium">Período</th>
              <th className="table-cell font-medium">Gestiones</th>
              <th className="table-cell font-medium">Pagos cobrados</th>
              <th className="table-cell font-medium">Monto cobrado</th>
              <th className="table-cell font-medium">Tasa</th>
              <th className="table-cell font-medium">Δ vs anterior</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.periodo}>
                <td className="table-cell font-medium">{row.periodo}</td>
                <td className="table-cell">{row.gestiones}</td>
                <td className="table-cell">{row.cobradas}</td>
                <td className="table-cell">{formatCurrency(row.montoCobrado)}</td>
                <td className="table-cell font-medium">{row.tasa}%</td>
                <td className="table-cell">
                  {row.delta === null ? "-" : (
                    <span className={row.delta > 0 ? "text-emerald-600" : row.delta < 0 ? "text-rose-600" : ""}>
                      {row.delta > 0 ? "↑" : row.delta < 0 ? "↓" : "="} {Math.abs(row.delta)}%
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="table-cell text-center text-[var(--muted)]" colSpan={6}>Sin datos</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
