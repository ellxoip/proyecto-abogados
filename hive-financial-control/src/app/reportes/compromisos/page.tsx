import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import { reportCompromisosPago } from "@/server/reports/new-reports";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function asValue(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

const estadoClass: Record<string, string> = {
  ACTIVO: "bg-sky-100 text-sky-700",
  INCUMPLIDO: "bg-rose-100 text-rose-700",
  CUMPLIDO: "bg-emerald-100 text-emerald-700",
};

export default async function CompromisosPage({ searchParams }: Props) {
  const sp = await searchParams;
  const estado = asValue(sp.estado);

  const { rows, summary } = await reportCompromisosPago({ estado });

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">Compromisos de pago</h2>
        <p className="text-sm text-[var(--muted)]">Contratos repactados — estado de cumplimiento</p>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Activos</p>
          <p className="mt-1 text-xl font-semibold text-sky-700">{summary.activos}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Incumplidos</p>
          <p className="mt-1 text-xl font-semibold text-rose-700">{summary.incumplidos}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Cumplidos</p>
          <p className="mt-1 text-xl font-semibold text-emerald-700">{summary.cumplidos}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Tasa de cumplimiento</p>
          <p className="mt-1 text-xl font-semibold">{summary.tasa}%</p>
        </div>
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-4" method="GET">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--muted)]">Estado</label>
          <select name="estado" defaultValue={estado ?? ""} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
            <option value="">Todos</option>
            <option value="ACTIVO">Activo</option>
            <option value="INCUMPLIDO">Incumplido</option>
            <option value="CUMPLIDO">Cumplido</option>
          </select>
        </div>
        <button className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white" type="submit">
          Filtrar
        </button>
        {estado && (
          <a href="/reportes/compromisos" className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)]">
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
              <th className="table-cell font-medium">Servicio</th>
              <th className="table-cell font-medium">Saldo total</th>
              <th className="table-cell font-medium">Vencido</th>
              <th className="table-cell font-medium">Próxima fecha</th>
              <th className="table-cell font-medium">Estado</th>
              <th className="table-cell font-medium">Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.contratoId}>
                <td className="table-cell font-medium">{row.clienteNombre}</td>
                <td className="table-cell">{row.clienteRut}</td>
                <td className="table-cell">{row.contratoServicio}</td>
                <td className="table-cell">{formatCurrency(row.montoTotal)}</td>
                <td className="table-cell text-rose-700">{row.montoVencido > 0 ? formatCurrency(row.montoVencido) : "-"}</td>
                <td className="table-cell">{row.proximaFecha ? formatDate(new Date(row.proximaFecha)) : "-"}</td>
                <td className="table-cell">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${estadoClass[row.estado] ?? ""}`}>
                    {row.estado}
                  </span>
                </td>
                <td className="table-cell">
                  <Link href={`/cuotas/${row.contratoId}`} className="text-[var(--accent)] hover:underline text-xs">
                    Ver cuotas
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="table-cell text-center text-[var(--muted)]" colSpan={8}>Sin datos</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
