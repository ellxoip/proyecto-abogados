import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { parseReportFilters, reportVencimientos } from "@/server/reports/reporting";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function read(raw: Record<string, string | string[] | undefined>, k: string) {
  const v = raw[k];
  return Array.isArray(v) ? v[0] : v;
}

export default async function ReporteVencimientosPage({ searchParams }: Props) {
  const raw = await searchParams;
  const filters = parseReportFilters(raw);
  const clientes = await prisma.cliente.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: "asc" } });
  const vencimientos = await reportVencimientos(filters);

  const query = new URLSearchParams();
  for (const key of ["from", "to", "estado", "servicio", "cliente"]) {
    const value = read(raw, key);
    if (value) query.set(key, value);
  }
  const qs = query.toString();
  const exportHref = `/api/reportes/vencimientos?${qs}${qs ? "&" : ""}format=csv`;

  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-2xl font-semibold">Vencimientos</h2>
        <p className="text-sm text-[var(--muted)]">Cuotas vencidas y próximas a vencer</p>
      </header>

      <form className="card p-4 grid gap-3 md:grid-cols-5" method="GET">
        <input name="from" type="date" defaultValue={read(raw, "from")} className="border rounded-md px-3 py-2 border-[var(--border)] bg-white text-sm" />
        <input name="to" type="date" defaultValue={read(raw, "to")} className="border rounded-md px-3 py-2 border-[var(--border)] bg-white text-sm" />
        <input name="estado" placeholder="Estado" defaultValue={read(raw, "estado")} className="border rounded-md px-3 py-2 border-[var(--border)] bg-white text-sm" />
        <input name="servicio" placeholder="Servicio" defaultValue={read(raw, "servicio")} className="border rounded-md px-3 py-2 border-[var(--border)] bg-white text-sm" />
        <select name="cliente" defaultValue={read(raw, "cliente") ?? ""} className="border rounded-md px-3 py-2 border-[var(--border)] bg-white text-sm">
          <option value="">Todos los clientes</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <div className="md:col-span-5 flex gap-2">
          <button type="submit" className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">Filtrar</button>
          <Link href="/reportes/vencimientos" className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">Limpiar</Link>
          <Link href={exportHref} className="ml-auto text-sm text-[var(--accent)] hover:underline self-center">Exportar CSV</Link>
        </div>
      </form>

      <p className="text-sm text-[var(--muted)]">{vencimientos.length} cuota{vencimientos.length === 1 ? "" : "s"}</p>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--muted)]">
            <tr>
              <th className="table-cell font-medium">Vencimiento</th>
              <th className="table-cell font-medium">Cliente</th>
              <th className="table-cell font-medium">Servicio</th>
              <th className="table-cell font-medium text-center">Cuota</th>
              <th className="table-cell font-medium">Monto</th>
              <th className="table-cell font-medium">Estado</th>
              <th className="table-cell font-medium text-center">Días atraso</th>
            </tr>
          </thead>
          <tbody>
            {vencimientos.map((v, i) => (
              <tr key={`${v.cliente}-${v.numeroCuota}-${i}`} className={v.diasAtraso > 0 ? "bg-rose-50/40 hover:bg-rose-50" : "hover:bg-slate-50"}>
                <td className="table-cell">{formatDate(v.fechaVencimiento)}</td>
                <td className="table-cell">{v.cliente}</td>
                <td className="table-cell">{v.servicio}</td>
                <td className="table-cell text-center">{v.numeroCuota}</td>
                <td className="table-cell font-medium">{formatCurrency(v.monto)}</td>
                <td className="table-cell">{v.estado}</td>
                <td className="table-cell text-center">
                  {v.diasAtraso > 0 ? (
                    <span className="font-medium text-rose-600">{v.diasAtraso}d</span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
            {vencimientos.length === 0 && (
              <tr><td colSpan={7} className="table-cell text-center text-[var(--muted)]">Sin registros para los filtros aplicados</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
