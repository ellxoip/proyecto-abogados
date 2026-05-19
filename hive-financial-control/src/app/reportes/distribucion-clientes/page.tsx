import { formatCurrency } from "@/lib/format";
import { reportDistribucionClientes } from "@/server/reports/new-reports";

export default async function DistribucionClientesPage() {
  const { rows, total } = await reportDistribucionClientes();

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">Distribución de clientes</h2>
        <p className="text-sm text-[var(--muted)]">Composición de la cartera por tipo de cliente</p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <div key={row.tipo} className="card space-y-3 p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{row.tipo}</h3>
              <span className="text-2xl font-bold">{row.clientes}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full bg-[var(--accent)]"
                style={{ width: `${total > 0 ? Math.round((row.clientes / total) * 100) : 0}%` }}
              />
            </div>
            <p className="text-xs text-[var(--muted)]">
              {total > 0 ? Math.round((row.clientes / total) * 100) : 0}% del total
            </p>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs text-[var(--muted)]">Contratos</dt>
                <dd className="font-medium">{row.contratos}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Morosos</dt>
                <dd className="font-medium text-rose-600">{row.morosos}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Monto total</dt>
                <dd className="font-medium">{formatCurrency(row.montoTotal)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Deuda activa</dt>
                <dd className="font-medium">{formatCurrency(row.deudaActiva)}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--muted)]">
            <tr>
              <th className="table-cell font-medium">Tipo</th>
              <th className="table-cell font-medium">Clientes</th>
              <th className="table-cell font-medium">% Total</th>
              <th className="table-cell font-medium">Contratos</th>
              <th className="table-cell font-medium">Monto total</th>
              <th className="table-cell font-medium">Deuda activa</th>
              <th className="table-cell font-medium">Morosos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.tipo}>
                <td className="table-cell font-medium">{row.tipo}</td>
                <td className="table-cell">{row.clientes}</td>
                <td className="table-cell">{total > 0 ? Math.round((row.clientes / total) * 100) : 0}%</td>
                <td className="table-cell">{row.contratos}</td>
                <td className="table-cell">{formatCurrency(row.montoTotal)}</td>
                <td className="table-cell">{formatCurrency(row.deudaActiva)}</td>
                <td className="table-cell text-rose-700">{row.morosos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
