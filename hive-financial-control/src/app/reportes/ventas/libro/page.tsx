import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import Link from "next/link";

export default async function LibroVentasPage({ searchParams }: { searchParams: { mes?: string } }) {
  const hoy = new Date();
  const periodoDefault = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  const periodo = searchParams.mes ?? periodoDefault;
  const [anio, mes] = periodo.split("-").map(Number);
  const inicio = new Date(anio, mes - 1, 1);
  const fin = new Date(anio, mes, 0, 23, 59, 59);

  const documentos = await prisma.documentoVenta.findMany({
    where: {
      fecha_emision: { gte: inicio, lte: fin },
      estado: { not: "ANULADO" },
    },
    orderBy: [{ tipo: "asc" }, { fecha_emision: "asc" }],
  });

  const totales = documentos.reduce((acc, d) => ({
    exento: acc.exento + (Number(d.iva) === 0 ? Number(d.monto_neto) : 0),
    afecto: acc.afecto + (Number(d.iva) > 0 ? Number(d.monto_neto) : 0),
    iva: acc.iva + Number(d.iva),
    total: acc.total + Number(d.monto_total),
  }), { exento: 0, afecto: 0, iva: 0, total: 0 });

  const meses = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(hoy.getFullYear(), i, 1);
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("es-CL", { month: "long", year: "numeric" }),
    };
  });

  return (
    <section className="space-y-6">
      <header>
        <Link href="/reportes" className="text-xs text-[var(--muted)] hover:underline">← Reportes</Link>
        <h2 className="mt-1 text-2xl font-semibold">Libro de ventas</h2>
        <p className="text-sm text-[var(--muted)]">Reporte tributario mensual — {inicio.toLocaleDateString("es-CL", { month: "long", year: "numeric" })}</p>
      </header>

      <form method="get" className="card p-4 flex gap-4 flex-wrap">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Período</label>
          <select name="mes" defaultValue={periodo}
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
            {meses.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button type="submit" className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">Ver</button>
        </div>
      </form>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Base exenta</p>
          <p className="mt-1 text-xl font-bold">{formatCurrency(totales.exento)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Base afecta</p>
          <p className="mt-1 text-xl font-bold">{formatCurrency(totales.afecto)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">IVA débito</p>
          <p className="mt-1 text-xl font-bold">{formatCurrency(totales.iva)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Total ventas</p>
          <p className="mt-1 text-xl font-bold text-emerald-600">{formatCurrency(totales.total)}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Fecha</th>
              <th className="table-cell text-left font-medium">Tipo DTE</th>
              <th className="table-cell text-left font-medium">N° Folio</th>
              <th className="table-cell text-left font-medium">Razón social receptor</th>
              <th className="table-cell text-left font-medium">RUT receptor</th>
              <th className="table-cell text-right font-medium">Exento</th>
              <th className="table-cell text-right font-medium">Neto</th>
              <th className="table-cell text-right font-medium">IVA</th>
              <th className="table-cell text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {documentos.map(d => {
              const isExento = Number(d.iva) === 0;
              return (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="table-cell">{formatDate(d.fecha_emision)}</td>
                  <td className="table-cell text-xs">{d.tipo.replace(/_/g, " ")}</td>
                  <td className="table-cell text-[var(--muted)]">{d.numero ?? "—"}</td>
                  <td className="table-cell">{d.razon_social}</td>
                  <td className="table-cell text-[var(--muted)]">{d.rut_receptor ?? "—"}</td>
                  <td className="table-cell text-right">{isExento ? formatCurrency(Number(d.monto_neto)) : "—"}</td>
                  <td className="table-cell text-right">{!isExento ? formatCurrency(Number(d.monto_neto)) : "—"}</td>
                  <td className="table-cell text-right">{formatCurrency(Number(d.iva))}</td>
                  <td className="table-cell text-right font-semibold">{formatCurrency(Number(d.monto_total))}</td>
                </tr>
              );
            })}
            {documentos.length === 0 && <tr><td colSpan={9} className="table-cell text-center text-[var(--muted)]">Sin documentos en el período</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
