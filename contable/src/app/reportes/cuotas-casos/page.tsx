import { formatCurrency } from "@/lib/format";
import { reportCuotasCasosVsRegulares } from "@/server/reports/new-reports";

export default async function CuotasCasosPage() {
  const { rows } = await reportCuotasCasosVsRegulares();

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">Cuotas: casos legales vs regulares</h2>
        <p className="text-sm text-[var(--muted)]">Comparación de tasas de pago entre cuotas asociadas a casos legales y cuotas regulares</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((row) => (
          <div key={row.tipo} className="card space-y-3 p-5">
            <h3 className="text-lg font-semibold">{row.tipo}</h3>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-[var(--muted)]">Total cuotas</dt>
                <dd className="mt-0.5 text-xl font-bold">{row.cuotas}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Tasa de pago</dt>
                <dd className={`mt-0.5 text-xl font-bold ${row.tasaPago >= 70 ? "text-emerald-700" : row.tasaPago >= 50 ? "text-amber-700" : "text-rose-700"}`}>
                  {row.tasaPago}%
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Monto total</dt>
                <dd className="mt-0.5 font-medium">{formatCurrency(row.montoTotal)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Pagadas</dt>
                <dd className="mt-0.5 font-medium text-emerald-700">{row.pagadas}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Pendientes</dt>
                <dd className="mt-0.5 font-medium text-amber-700">{row.pendientes}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Vencidas</dt>
                <dd className="mt-0.5 font-medium text-rose-700">{row.vencidas}</dd>
              </div>
            </dl>
            <div className="pt-1">
              <div className="h-2 w-full rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${row.tasaPago}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--muted)]">
            <tr>
              <th className="table-cell font-medium">Tipo</th>
              <th className="table-cell font-medium">Cuotas</th>
              <th className="table-cell font-medium">Monto total</th>
              <th className="table-cell font-medium">Pagadas</th>
              <th className="table-cell font-medium">Pendientes</th>
              <th className="table-cell font-medium">Vencidas</th>
              <th className="table-cell font-medium">Tasa pago</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.tipo}>
                <td className="table-cell font-medium">{row.tipo}</td>
                <td className="table-cell">{row.cuotas}</td>
                <td className="table-cell">{formatCurrency(row.montoTotal)}</td>
                <td className="table-cell text-emerald-700">{row.pagadas}</td>
                <td className="table-cell text-amber-700">{row.pendientes}</td>
                <td className="table-cell text-rose-700">{row.vencidas}</td>
                <td className="table-cell font-medium">{row.tasaPago}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
