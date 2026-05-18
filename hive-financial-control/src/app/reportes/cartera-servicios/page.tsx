import { formatCurrency } from "@/lib/format";
import { reportCarteraServicios } from "@/server/reports/new-reports";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function asValue(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function CarteraServiciosPage({ searchParams }: Props) {
  const sp = await searchParams;
  const from = asValue(sp.from);
  const to = asValue(sp.to);

  const { rows, summary } = await reportCarteraServicios({
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">Cartera por tipo de servicio</h2>
        <p className="text-sm text-[var(--muted)]">Revenue, cobros y saldos agrupados por servicio contratado</p>
      </header>

      <div className="grid gap-3 md:grid-cols-5">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Servicios</p>
          <p className="mt-1 text-xl font-semibold">{summary.totalServicios}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Contratos</p>
          <p className="mt-1 text-xl font-semibold">{summary.totalContratos}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Revenue total</p>
          <p className="mt-1 text-xl font-semibold">{formatCurrency(summary.totalRevenue)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Total pagado</p>
          <p className="mt-1 text-xl font-semibold text-emerald-700">{formatCurrency(summary.totalPagado)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Saldo pendiente</p>
          <p className="mt-1 text-xl font-semibold text-amber-700">{formatCurrency(summary.totalSaldo)}</p>
        </div>
      </div>

      <form className="card grid gap-3 p-4 md:grid-cols-3" method="GET">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--muted)]">Desde (fecha contrato)</label>
          <input name="from" type="date" defaultValue={from} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--muted)]">Hasta (fecha contrato)</label>
          <input name="to" type="date" defaultValue={to} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
        </div>
        <div className="flex items-end gap-2">
          <button className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white" type="submit">
            Filtrar
          </button>
          {(from || to) && (
            <a href="/reportes/cartera-servicios" className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)]">
              Limpiar
            </a>
          )}
        </div>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--muted)]">
            <tr>
              <th className="table-cell font-medium">Servicio</th>
              <th className="table-cell font-medium">Contratos</th>
              <th className="table-cell font-medium">Monto total</th>
              <th className="table-cell font-medium">Pagado</th>
              <th className="table-cell font-medium">Saldo</th>
              <th className="table-cell font-medium">% Revenue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.servicio}>
                <td className="table-cell font-medium">{row.servicio}</td>
                <td className="table-cell">{row.contratos}</td>
                <td className="table-cell">{formatCurrency(row.montoTotal)}</td>
                <td className="table-cell text-emerald-700">{formatCurrency(row.pagado)}</td>
                <td className="table-cell">{row.saldo > 0 ? formatCurrency(row.saldo) : "-"}</td>
                <td className="table-cell">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 rounded-full bg-slate-100">
                      <div className="h-1.5 rounded-full bg-[var(--accent)]" style={{ width: `${row.pctRevenue}%` }} />
                    </div>
                    <span>{row.pctRevenue}%</span>
                  </div>
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
