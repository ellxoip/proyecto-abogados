import { reportClientesNuevos } from "@/server/reports/new-reports";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function asValue(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ClientesNuevosPage({ searchParams }: Props) {
  const sp = await searchParams;
  const from = asValue(sp.from);
  const to = asValue(sp.to);

  const { rows, summary } = await reportClientesNuevos({
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">Clientes nuevos por mes</h2>
        <p className="text-sm text-[var(--muted)]">Incorporaciones agrupadas por período y tipo de cliente</p>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Total clientes</p>
          <p className="mt-1 text-xl font-semibold">{summary.total}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Personas</p>
          <p className="mt-1 text-xl font-semibold">{summary.personas}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Empresas</p>
          <p className="mt-1 text-xl font-semibold">{summary.empresas}</p>
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
            <a href="/reportes/clientes-nuevos" className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)]">
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
              <th className="table-cell font-medium">Total</th>
              <th className="table-cell font-medium">Personas</th>
              <th className="table-cell font-medium">Empresas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.periodo}>
                <td className="table-cell font-medium">{row.periodo}</td>
                <td className="table-cell">{row.total}</td>
                <td className="table-cell">{row.personas}</td>
                <td className="table-cell">{row.empresas}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="table-cell text-center text-[var(--muted)]" colSpan={4}>Sin datos</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
