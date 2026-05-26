import Link from "next/link";
import { formatDate } from "@/lib/format";
import { reportCasosLegales } from "@/server/reports/new-reports";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function asValue(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function CasosLegalesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const from = asValue(sp.from);
  const to = asValue(sp.to);
  const estado = asValue(sp.estado);

  const { rows, summary } = await reportCasosLegales({
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    estado,
  });

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">Casos legales</h2>
        <p className="text-sm text-[var(--muted)]">Casos abiertos, cerrados y duración promedio</p>
      </header>

      <div className="grid gap-3 md:grid-cols-5">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Total</p>
          <p className="mt-1 text-xl font-semibold">{summary.total}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Abiertos</p>
          <p className="mt-1 text-xl font-semibold text-amber-700">{summary.abiertos}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Cerrados</p>
          <p className="mt-1 text-xl font-semibold text-emerald-700">{summary.cerrados}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Duración promedio</p>
          <p className="mt-1 text-xl font-semibold">{summary.duracionPromedio} días</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Con contrato</p>
          <p className="mt-1 text-xl font-semibold">{summary.conContrato}</p>
        </div>
      </div>

      <form className="card grid gap-3 p-4 md:grid-cols-4" method="GET">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--muted)]">Desde apertura</label>
          <input name="from" type="date" defaultValue={from} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--muted)]">Hasta apertura</label>
          <input name="to" type="date" defaultValue={to} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--muted)]">Estado</label>
          <select name="estado" defaultValue={estado ?? ""} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
            <option value="">Todos</option>
            <option value="ABIERTO">Abierto</option>
            <option value="CERRADO">Cerrado</option>
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white" type="submit">
            Filtrar
          </button>
          {(from || to || estado) && (
            <a href="/reportes/casos-legales" className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)]">
              Limpiar
            </a>
          )}
        </div>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--muted)]">
            <tr>
              <th className="table-cell font-medium">Código</th>
              <th className="table-cell font-medium">Título</th>
              <th className="table-cell font-medium">Cliente</th>
              <th className="table-cell font-medium">Estado</th>
              <th className="table-cell font-medium">Apertura</th>
              <th className="table-cell font-medium">Cierre</th>
              <th className="table-cell font-medium">Días</th>
              <th className="table-cell font-medium">Contrato</th>
              <th className="table-cell font-medium">Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="table-cell font-medium">{row.codigo}</td>
                <td className="table-cell">{row.titulo}</td>
                <td className="table-cell">{row.clienteNombre}</td>
                <td className="table-cell">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${row.estado === "ABIERTO" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {row.estado}
                  </span>
                </td>
                <td className="table-cell">{formatDate(new Date(row.fechaApertura))}</td>
                <td className="table-cell">{row.fechaCierre ? formatDate(new Date(row.fechaCierre)) : "-"}</td>
                <td className="table-cell">{row.diasAbierto}</td>
                <td className="table-cell">{row.tieneContrato ? "Sí" : "-"}</td>
                <td className="table-cell">
                  <Link href={`/clientes/${row.clienteId}`} className="text-[var(--accent)] hover:underline text-xs">
                    Ver cliente
                  </Link>
                </td>
              </tr>
            ))}
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
