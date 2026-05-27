import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";

export default async function VentasPage() {
  const [documentos, servicios] = await Promise.all([
    prisma.documentoVenta.findMany({ orderBy: { fecha_emision: "desc" }, take: 5, include: { cliente: { select: { nombre: true } } } }),
    prisma.servicio.count({ where: { activo: true } }),
  ]);

  const totalMes = await prisma.documentoVenta.aggregate({
    _sum: { monto_total: true },
    where: { fecha_emision: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
  });
  const pendientePago = await prisma.documentoVenta.aggregate({
    _sum: { monto_total: true },
    where: { estado: { in: ["EMITIDO", "ACEPTADO_SII"] } },
  });

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Ventas y facturación</h2>
          <p className="text-sm text-[var(--muted)]">Documentos tributarios, servicios y facturación recurrente</p>
        </div>
        <Link href="/ventas/documentos/nuevo" className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Nuevo documento
        </Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Ventas del mes</p>
          <p className="mt-1 text-xl font-bold">{formatCurrency(Number(totalMes._sum.monto_total ?? 0))}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Por cobrar</p>
          <p className="mt-1 text-xl font-bold text-amber-600">{formatCurrency(Number(pendientePago._sum.monto_total ?? 0))}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Servicios activos</p>
          <p className="mt-1 text-xl font-bold">{servicios}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/ventas/documentos" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Documentos</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Facturas, boletas y notas de crédito</p>
        </Link>
        <Link href="/ventas/servicios" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Servicios</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Catálogo de servicios facturables</p>
        </Link>
        <Link href="/ventas/recurrente" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Recurrente</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Reglas de facturación automática</p>
        </Link>
        <Link href="/ventas/notas-credito" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Notas de crédito</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Anulaciones y descuentos</p>
        </Link>
      </div>

      {documentos.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <p className="text-sm font-medium">Últimos documentos</p>
            <Link href="/ventas/documentos" className="text-xs text-[var(--accent)] hover:underline">Ver todos</Link>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-[var(--border)]">
              {documentos.map(d => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="table-cell font-medium">{d.tipo}</td>
                  <td className="table-cell">{d.razon_social}</td>
                  <td className="table-cell">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${d.estado === "PAGADO" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{d.estado}</span>
                  </td>
                  <td className="table-cell text-right">{formatCurrency(Number(d.monto_total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
