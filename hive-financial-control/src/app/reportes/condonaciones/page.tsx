import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import { reportCondonaciones } from "@/server/reports/new-reports";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function asValue(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function CondonacionesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const from = asValue(sp.from);
  const to = asValue(sp.to);

  const { rows, summary } = await reportCondonaciones({
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });

  const usuarioEntries = Object.entries(summary.byUsuario).sort((a, b) => b[1].monto - a[1].monto);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">Condonaciones</h2>
        <p className="text-sm text-[var(--muted)]">Cuotas condonadas — montos y responsables</p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Total condonaciones</p>
          <p className="mt-1 text-xl font-semibold">{summary.total}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Monto total condonado</p>
          <p className="mt-1 text-xl font-semibold text-rose-700">{formatCurrency(summary.totalCondonado)}</p>
        </div>
      </div>

      {usuarioEntries.length > 0 && (
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-[var(--muted)]">Por usuario</h3>
          <div className="flex flex-wrap gap-3">
            {usuarioEntries.map(([usuario, { count, monto }]) => (
              <div key={usuario} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
                <p className="font-medium">{usuario}</p>
                <p className="text-xs text-[var(--muted)]">{count} condonaciones · {formatCurrency(monto)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

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
            <a href="/reportes/condonaciones" className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)]">
              Limpiar
            </a>
          )}
        </div>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--muted)]">
            <tr>
              <th className="table-cell font-medium">Fecha</th>
              <th className="table-cell font-medium">Cliente</th>
              <th className="table-cell font-medium">Servicio</th>
              <th className="table-cell font-medium">Monto condonado</th>
              <th className="table-cell font-medium">Usuario</th>
              <th className="table-cell font-medium">Motivo</th>
              <th className="table-cell font-medium">Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="table-cell">{formatDate(new Date(row.fecha))}</td>
                <td className="table-cell font-medium">{row.clienteNombre}</td>
                <td className="table-cell">{row.contratoServicio}</td>
                <td className="table-cell text-rose-700 font-medium">{formatCurrency(row.montoCondonado)}</td>
                <td className="table-cell">{row.usuario}</td>
                <td className="table-cell max-w-xs truncate" title={row.motivo}>{row.motivo}</td>
                <td className="table-cell">
                  <Link href={`/cuotas/${row.contratoId}`} className="text-[var(--accent)] hover:underline text-xs">
                    Ver contrato
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="table-cell text-center text-[var(--muted)]" colSpan={7}>Sin condonaciones para los filtros aplicados</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
