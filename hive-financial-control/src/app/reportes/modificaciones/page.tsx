import Link from "next/link";
import { formatDate } from "@/lib/format";
import { reportModificaciones } from "@/server/reports/new-reports";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function asValue(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

const tipoClass: Record<string, string> = {
  REPACTACION: "bg-sky-100 text-sky-700",
  CONDONACION: "bg-emerald-100 text-emerald-700",
  CAMBIO_MONTO: "bg-amber-100 text-amber-700",
  ANULACION: "bg-rose-100 text-rose-700",
  CAMBIO_FECHA: "bg-slate-100 text-slate-700",
  EDICION_PAGO: "bg-indigo-100 text-indigo-700",
};

const TIPOS = ["REPACTACION", "CONDONACION", "CAMBIO_MONTO", "ANULACION", "CAMBIO_FECHA", "EDICION_PAGO"];

export default async function ModificacionesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const from = asValue(sp.from);
  const to = asValue(sp.to);
  const tipo = asValue(sp.tipo);

  const { rows, summary } = await reportModificaciones({
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    tipo,
  });

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">Modificaciones de contrato</h2>
        <p className="text-sm text-[var(--muted)]">Historial de cambios: repactaciones, condonaciones, anulaciones y más</p>
      </header>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {TIPOS.map((t) => (
          <div key={t} className="card p-4">
            <p className="text-xs text-[var(--muted)]">{t.replace("_", " ")}</p>
            <p className="mt-1 text-xl font-semibold">{summary.byTipo[t] ?? 0}</p>
          </div>
        ))}
      </div>

      <form className="card grid gap-3 p-4 md:grid-cols-4" method="GET">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--muted)]">Desde</label>
          <input name="from" type="date" defaultValue={from} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--muted)]">Hasta</label>
          <input name="to" type="date" defaultValue={to} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--muted)]">Tipo</label>
          <select name="tipo" defaultValue={tipo ?? ""} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
            <option value="">Todos</option>
            {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white" type="submit">
            Filtrar
          </button>
          {(from || to || tipo) && (
            <a href="/reportes/modificaciones" className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)]">
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
              <th className="table-cell font-medium">Tipo</th>
              <th className="table-cell font-medium">Cliente</th>
              <th className="table-cell font-medium">Servicio</th>
              <th className="table-cell font-medium">Usuario</th>
              <th className="table-cell font-medium">Motivo</th>
              <th className="table-cell font-medium">Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="table-cell">{formatDate(new Date(row.fecha))}</td>
                <td className="table-cell">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${tipoClass[row.tipo] ?? "bg-slate-100 text-slate-700"}`}>
                    {row.tipo}
                  </span>
                </td>
                <td className="table-cell font-medium">{row.clienteNombre}</td>
                <td className="table-cell">{row.contratoServicio}</td>
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
                <td className="table-cell text-center text-[var(--muted)]" colSpan={7}>Sin datos</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
