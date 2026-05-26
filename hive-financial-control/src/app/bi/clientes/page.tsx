import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";

export default async function BiClientesPage() {
  const clientes = await prisma.cliente.findMany({
    include: {
      contratos: {
        where: { estado: "ACTIVO" },
        select: {
          id: true,
          cuotas: { select: { monto_pagado: true, saldo_pendiente: true, estado: true } },
        },
      },
    },
    orderBy: { nombre: "asc" },
    take: 50,
  });

  const ranking = clientes.map(c => {
    const cuotas = c.contratos.flatMap((ct) => ct.cuotas);
    const pagado = cuotas.reduce((s, q) => s + Number(q.monto_pagado), 0);
    const pendiente = cuotas.reduce((s, q) => s + Number(q.saldo_pendiente), 0);
    const mora = cuotas.filter(q => q.estado === "VENCIDA").reduce((s, q) => s + Number(q.saldo_pendiente), 0);
    return { ...c, pagado, pendiente, mora, contratos: c.contratos.length };
  }).sort((a, b) => b.pagado - a.pagado);

  return (
    <section className="space-y-6">
      <header>
        <Link href="/bi" className="text-xs text-[var(--muted)] hover:underline">← BI</Link>
        <h2 className="text-2xl font-semibold mt-1">Análisis de clientes</h2>
        <p className="text-sm text-[var(--muted)]">Ranking y métricas por cliente</p>
      </header>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">#</th>
              <th className="table-cell text-left font-medium">Cliente</th>
              <th className="table-cell text-center font-medium">Contratos</th>
              <th className="table-cell text-right font-medium">Pagado</th>
              <th className="table-cell text-right font-medium">Pendiente</th>
              <th className="table-cell text-right font-medium">Mora</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {ranking.map((c, i) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="table-cell text-[var(--muted)]">{i + 1}</td>
                <td className="table-cell">
                  <Link href={`/clientes/${c.id}`} className="text-[var(--accent)] hover:underline font-medium">{c.nombre}</Link>
                  {c.rut && <p className="text-xs text-[var(--muted)]">{c.rut}</p>}
                </td>
                <td className="table-cell text-center">{c.contratos}</td>
                <td className="table-cell text-right text-emerald-600">{formatCurrency(c.pagado)}</td>
                <td className="table-cell text-right text-amber-600">{formatCurrency(c.pendiente)}</td>
                <td className="table-cell text-right text-rose-600">{c.mora > 0 ? formatCurrency(c.mora) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
