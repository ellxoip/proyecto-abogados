import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";

export default async function BiRentabilidadCasoPage() {
  const casos = await prisma.casoLegal.findMany({
    include: {
      cliente: { select: { nombre: true } },
      contrato: {
        include: {
          cuotas: { select: { monto_pagado: true, estado: true } },
        },
      },
    },
    orderBy: { fecha_apertura: "desc" },
  });

  const gastosPorCasos = await prisma.gastoCompra.findMany({
    select: { monto_total: true, descripcion: true },
    take: 0,
  });
  const totalGastosDirectos = gastosPorCasos.reduce((s, g) => s + Number(g.monto_total), 0);

  const stats = casos.map(caso => {
    const cuotas = caso.contrato?.cuotas ?? [];
    const ingresos = cuotas.reduce((s, q) => s + Number(q.monto_pagado), 0);
    const pendiente = cuotas
      .filter(q => q.estado !== "PAGADA" && q.estado !== "CONDONADA" && q.estado !== "ANULADA")
      .reduce((s, q) => s + Number(q.monto_pagado ?? 0), 0);
    const diasAbierto = caso.fecha_cierre
      ? Math.floor((new Date(caso.fecha_cierre).getTime() - new Date(caso.fecha_apertura).getTime()) / (1000 * 60 * 60 * 24))
      : Math.floor((new Date().getTime() - new Date(caso.fecha_apertura).getTime()) / (1000 * 60 * 60 * 24));
    return { ...caso, ingresos, pendiente, diasAbierto };
  });

  const totalIngresos = stats.reduce((s, c) => s + c.ingresos, 0);
  const casosAbiertos = stats.filter(c => c.estado === "ABIERTO").length;
  const avgDias = stats.length > 0 ? stats.reduce((s, c) => s + c.diasAbierto, 0) / stats.length : 0;

  return (
    <section className="space-y-6">
      <header>
        <Link href="/bi" className="text-xs text-[var(--muted)] hover:underline">← BI</Link>
        <h2 className="text-2xl font-semibold mt-1">Rentabilidad por caso</h2>
        <p className="text-sm text-[var(--muted)]">Ingresos y duración por caso legal</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Total casos</p>
          <p className="mt-1 text-2xl font-bold">{stats.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Casos abiertos</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{casosAbiertos}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Ingresos cobrados</p>
          <p className="mt-1 text-xl font-bold text-emerald-600">{formatCurrency(totalIngresos)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Duración promedio</p>
          <p className="mt-1 text-2xl font-bold">{Math.round(avgDias)}</p>
          <p className="text-xs text-[var(--muted)]">días</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="font-semibold text-sm">Rentabilidad por caso</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Caso</th>
              <th className="table-cell text-left font-medium">Cliente</th>
              <th className="table-cell text-left font-medium">Estado</th>
              <th className="table-cell text-right font-medium">Ingresos cobrados</th>
              <th className="table-cell text-center font-medium">Días abierto</th>
              <th className="table-cell text-left font-medium">Apertura</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {stats.map(caso => (
              <tr key={caso.id} className="hover:bg-slate-50">
                <td className="table-cell font-medium">
                  {caso.titulo}
                  {caso.codigo_interno && <p className="text-xs text-[var(--muted)]">{caso.codigo_interno}</p>}
                </td>
                <td className="table-cell text-[var(--muted)]">{caso.cliente.nombre}</td>
                <td className="table-cell">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${caso.estado === "ABIERTO" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                    {caso.estado}
                  </span>
                </td>
                <td className="table-cell text-right font-semibold text-emerald-600">{formatCurrency(caso.ingresos)}</td>
                <td className="table-cell text-center">{caso.diasAbierto}</td>
                <td className="table-cell text-xs text-[var(--muted)]">{new Date(caso.fecha_apertura).toLocaleDateString("es-CL")}</td>
              </tr>
            ))}
            {stats.length === 0 && <tr><td colSpan={6} className="table-cell text-center text-[var(--muted)]">Sin casos</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
