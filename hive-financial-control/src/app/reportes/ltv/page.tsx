import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { reportLTV } from "@/server/reports/new-reports";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function asValue(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function LtvPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = asValue(sp.q);

  const { rows, summary } = await reportLTV({ q });

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">Valor por cliente (LTV)</h2>
        <p className="text-sm text-[var(--muted)]">Total contratado, pagado y saldo pendiente por cliente — ordenado por valor</p>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Clientes</p>
          <p className="mt-1 text-xl font-semibold">{summary.totalClientes}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Total contratado</p>
          <p className="mt-1 text-xl font-semibold">{formatCurrency(summary.totalContratado)}</p>
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

      <form className="card flex flex-wrap items-end gap-3 p-4" method="GET">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar nombre o RUT..."
          className="rounded-md border border-[var(--border)] px-3 py-2 text-sm w-64"
        />
        <button className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white" type="submit">
          Buscar
        </button>
        {q && (
          <a href="/reportes/ltv" className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)]">
            Limpiar
          </a>
        )}
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--muted)]">
            <tr>
              <th className="table-cell font-medium">Cliente</th>
              <th className="table-cell font-medium">RUT</th>
              <th className="table-cell font-medium">Tipo</th>
              <th className="table-cell font-medium">Contratos</th>
              <th className="table-cell font-medium">Contratado</th>
              <th className="table-cell font-medium">Pagado</th>
              <th className="table-cell font-medium">Saldo</th>
              <th className="table-cell font-medium">% Pagado</th>
              <th className="table-cell font-medium">Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const pct = row.contratado > 0 ? Math.round((row.pagado / row.contratado) * 100) : 0;
              return (
                <tr key={row.clienteId}>
                  <td className="table-cell font-medium">{row.nombre}</td>
                  <td className="table-cell">{row.rut}</td>
                  <td className="table-cell">{row.tipo}</td>
                  <td className="table-cell">{row.contratos}</td>
                  <td className="table-cell">{formatCurrency(row.contratado)}</td>
                  <td className="table-cell text-emerald-700">{formatCurrency(row.pagado)}</td>
                  <td className="table-cell">{row.saldo > 0 ? formatCurrency(row.saldo) : "-"}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-slate-100">
                        <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span>{pct}%</span>
                    </div>
                  </td>
                  <td className="table-cell">
                    <Link href={`/clientes/${row.clienteId}`} className="text-[var(--accent)] hover:underline text-xs">
                      Ver cliente
                    </Link>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td className="table-cell text-center text-[var(--muted)]" colSpan={9}>Sin datos</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
