import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import Link from "next/link";

export default async function ReporteComprasDocumentosPage({ searchParams }: { searchParams: { desde?: string; hasta?: string; tipo?: string; estado?: string } }) {
  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const desde = searchParams.desde ? new Date(searchParams.desde) : inicioMes;
  const hasta = searchParams.hasta ? new Date(searchParams.hasta + "T23:59:59") : new Date(hoy.toISOString().slice(0, 10) + "T23:59:59");

  const documentos = await prisma.documentoCompra.findMany({
    where: {
      fecha_emision: { gte: desde, lte: hasta },
      ...(searchParams.tipo ? { tipo: searchParams.tipo as never } : {}),
      ...(searchParams.estado ? { estado: searchParams.estado as never } : {}),
    },
    include: { proveedor: { select: { nombre: true, rut: true } } },
    orderBy: { fecha_emision: "desc" },
  });

  const totales = documentos.reduce((acc, d) => ({
    neto: acc.neto + Number(d.monto_neto),
    iva: acc.iva + Number(d.iva),
    total: acc.total + Number(d.monto_total),
  }), { neto: 0, iva: 0, total: 0 });

  return (
    <section className="space-y-6">
      <header>
        <Link href="/reportes" className="text-xs text-[var(--muted)] hover:underline">← Reportes</Link>
        <h2 className="mt-1 text-2xl font-semibold">Documentos recibidos</h2>
        <p className="text-sm text-[var(--muted)]">Facturas y boletas de proveedor del período</p>
      </header>

      <form method="get" className="card p-4 grid gap-4 sm:grid-cols-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Desde</label>
          <input type="date" name="desde" defaultValue={desde.toISOString().slice(0, 10)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Hasta</label>
          <input type="date" name="hasta" defaultValue={hasta.toISOString().slice(0, 10)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Tipo</label>
          <select name="tipo" defaultValue={searchParams.tipo ?? ""}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm">
            <option value="">Todos</option>
            {["FACTURA","BOLETA","NOTA_CREDITO_RECIBIDA","NOTA_DEBITO_RECIBIDA"].map(t => (
              <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Estado</label>
          <select name="estado" defaultValue={searchParams.estado ?? ""}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm">
            <option value="">Todos</option>
            {["RECIBIDO","VALIDADO","ACEPTADO","RECLAMADO","ANULADO"].map(e => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button type="submit" className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">Filtrar</button>
        </div>
      </form>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Monto neto</p>
          <p className="mt-1 text-xl font-bold">{formatCurrency(totales.neto)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">IVA crédito</p>
          <p className="mt-1 text-xl font-bold">{formatCurrency(totales.iva)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Total ({documentos.length} docs)</p>
          <p className="mt-1 text-xl font-bold">{formatCurrency(totales.total)}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Fecha</th>
              <th className="table-cell text-left font-medium">Tipo</th>
              <th className="table-cell text-left font-medium">N°</th>
              <th className="table-cell text-left font-medium">Proveedor</th>
              <th className="table-cell text-right font-medium">Neto</th>
              <th className="table-cell text-right font-medium">IVA</th>
              <th className="table-cell text-right font-medium">Total</th>
              <th className="table-cell text-left font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {documentos.map(d => (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="table-cell">{formatDate(d.fecha_emision)}</td>
                <td className="table-cell text-xs">{d.tipo.replace(/_/g, " ")}</td>
                <td className="table-cell text-[var(--muted)]">{d.numero ?? "—"}</td>
                <td className="table-cell">
                  <p>{d.proveedor.nombre}</p>
                  <p className="text-xs text-[var(--muted)]">{d.proveedor.rut}</p>
                </td>
                <td className="table-cell text-right">{formatCurrency(Number(d.monto_neto))}</td>
                <td className="table-cell text-right">{formatCurrency(Number(d.iva))}</td>
                <td className="table-cell text-right font-semibold">{formatCurrency(Number(d.monto_total))}</td>
                <td className="table-cell">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${d.estado === "ACEPTADO" ? "bg-emerald-50 text-emerald-700" : d.estado === "RECLAMADO" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
                    {d.estado}
                  </span>
                </td>
              </tr>
            ))}
            {documentos.length === 0 && <tr><td colSpan={8} className="table-cell text-center text-[var(--muted)]">Sin documentos</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
