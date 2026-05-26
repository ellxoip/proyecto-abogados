import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ComprobanteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const comprobante = await prisma.comprobanteContable.findUnique({
    where: { id: Number(id) },
    include: {
      tipo: true,
      partidas: { include: { cuenta: { select: { codigo: true, nombre: true, tipo: true } } }, orderBy: { tipo: "desc" } },
      usuario: { select: { nombre: true } },
      aprobador: { select: { nombre: true } },
    },
  });
  if (!comprobante) notFound();

  return (
    <section className="space-y-6 max-w-3xl">
      <header className="flex items-center justify-between">
        <div>
          <Link href="/contabilidad/comprobantes" className="text-xs text-[var(--muted)] hover:underline">← Comprobantes</Link>
          <h2 className="text-2xl font-semibold mt-1">
            Comprobante {comprobante.tipo.prefijo ?? ""}{comprobante.numero}
          </h2>
          <p className="text-sm text-[var(--muted)]">{comprobante.tipo.nombre} · {formatDate(comprobante.fecha_comprobante)}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${comprobante.estado === "APROBADO" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
          {comprobante.estado}
        </span>
      </header>

      <div className="card p-5 space-y-2 text-sm">
        <p><span className="text-[var(--muted)]">Descripción:</span> {comprobante.descripcion}</p>
        <p><span className="text-[var(--muted)]">Usuario:</span> {comprobante.usuario?.nombre ?? "—"}</p>
        {comprobante.aprobador && <p><span className="text-[var(--muted)]">Aprobado por:</span> {comprobante.aprobador.nombre}</p>}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Código</th>
              <th className="table-cell text-left font-medium">Cuenta</th>
              <th className="table-cell text-left font-medium">Glosa</th>
              <th className="table-cell text-right font-medium">Debe</th>
              <th className="table-cell text-right font-medium">Haber</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {comprobante.partidas.map(p => (
              <tr key={p.id} className={`hover:bg-slate-50 ${p.tipo === "DEBE" ? "bg-blue-50" : ""}`}>
                <td className="table-cell font-mono text-xs">{p.cuenta.codigo}</td>
                <td className="table-cell">{p.cuenta.nombre}</td>
                <td className="table-cell text-[var(--muted)]">{p.glosa ?? "—"}</td>
                <td className="table-cell text-right">{p.tipo === "DEBE" ? formatCurrency(Number(p.monto)) : ""}</td>
                <td className="table-cell text-right">{p.tipo === "HABER" ? formatCurrency(Number(p.monto)) : ""}</td>
              </tr>
            ))}
            <tr className="bg-slate-100 font-semibold">
              <td colSpan={3} className="table-cell text-right">Totales</td>
              <td className="table-cell text-right">{formatCurrency(Number(comprobante.total_debe))}</td>
              <td className="table-cell text-right">{formatCurrency(Number(comprobante.total_haber))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
