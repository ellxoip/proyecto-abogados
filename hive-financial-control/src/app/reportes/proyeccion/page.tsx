import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { parseReportFilters, reportProyeccionCaja } from "@/server/reports/reporting";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function read(raw: Record<string, string | string[] | undefined>, k: string) {
  const v = raw[k];
  return Array.isArray(v) ? v[0] : v;
}

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function formatMes(mes: string) {
  const [year, month] = mes.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

export default async function ReporteProyeccionPage({ searchParams }: Props) {
  const raw = await searchParams;
  const filters = parseReportFilters(raw);
  const clientes = await prisma.cliente.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: "asc" } });
  const proyeccion = await reportProyeccionCaja(filters);

  const query = new URLSearchParams();
  for (const key of ["from", "to", "estado", "servicio", "cliente"]) {
    const value = read(raw, key);
    if (value) query.set(key, value);
  }
  const qs = query.toString();
  const exportHref = `/api/reportes/proyeccion?${qs}${qs ? "&" : ""}format=csv`;

  const totalEsperado = proyeccion.reduce((acc, p) => acc + p.montoEsperado, 0);
  const totalVencido = proyeccion.reduce((acc, p) => acc + p.montoVencidoRecuperable, 0);
  const totalProyectado = proyeccion.reduce((acc, p) => acc + p.totalProyectado, 0);

  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-2xl font-semibold">Proyección de caja mensual</h2>
        <p className="text-sm text-[var(--muted)]">Ingresos esperados y recuperables por mes</p>
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
          <Link href="/reportes/proyeccion" className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">Limpiar</Link>
          <Link href={exportHref} className="ml-auto text-sm text-[var(--accent)] hover:underline self-center">Exportar CSV</Link>
        </div>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--muted)]">
            <tr>
              <th className="table-cell font-medium">Mes</th>
              <th className="table-cell font-medium">Esperado</th>
              <th className="table-cell font-medium">Vencido recuperable</th>
              <th className="table-cell font-medium">Total proyectado</th>
            </tr>
          </thead>
          <tbody>
            {proyeccion.map((p) => (
              <tr key={p.mes} className="hover:bg-slate-50">
                <td className="table-cell font-medium">{formatMes(p.mes)}</td>
                <td className="table-cell">{formatCurrency(p.montoEsperado)}</td>
                <td className="table-cell text-amber-700">{formatCurrency(p.montoVencidoRecuperable)}</td>
                <td className="table-cell font-semibold">{formatCurrency(p.totalProyectado)}</td>
              </tr>
            ))}
            {proyeccion.length === 0 && (
              <tr><td colSpan={4} className="table-cell text-center text-[var(--muted)]">Sin datos de proyección</td></tr>
            )}
          </tbody>
          {proyeccion.length > 0 && (
            <tfoot className="bg-slate-50 font-semibold">
              <tr>
                <td className="table-cell">Total</td>
                <td className="table-cell">{formatCurrency(totalEsperado)}</td>
                <td className="table-cell text-amber-700">{formatCurrency(totalVencido)}</td>
                <td className="table-cell">{formatCurrency(totalProyectado)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
