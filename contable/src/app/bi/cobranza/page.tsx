import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";

export default async function BiCobranzaPage() {
  const [total, pendiente, vencida, pagada] = await Promise.all([
    prisma.cuota.aggregate({ _sum: { monto_actual: true } }),
    prisma.cuota.aggregate({ _sum: { saldo_pendiente: true }, where: { estado: { in: ["PENDIENTE", "PARCIAL"] } } }),
    prisma.cuota.aggregate({ _sum: { saldo_pendiente: true }, where: { estado: "VENCIDA" } }),
    prisma.cuota.aggregate({ _sum: { monto_pagado: true }, where: { estado: "PAGADA" } }),
  ]);

  const totalVal = Number(total._sum.monto_actual ?? 0);
  const pagadaVal = Number(pagada._sum.monto_pagado ?? 0);
  const vencidaVal = Number(vencida._sum.saldo_pendiente ?? 0);
  const eficiencia = totalVal > 0 ? (pagadaVal / totalVal) * 100 : 0;
  const tasaMora = totalVal > 0 ? (vencidaVal / totalVal) * 100 : 0;

  const topMorosos = await prisma.cliente.findMany({
    where: { contratos: { some: { cuotas: { some: { estado: "VENCIDA" } } } } },
    include: {
      contratos: {
        select: {
          cuotas: { where: { estado: "VENCIDA" }, select: { saldo_pendiente: true } },
        },
      },
    },
    take: 10,
  });
  topMorosos.sort((a, b) => {
    const ma = a.contratos.flatMap((ct) => ct.cuotas).reduce((s, c) => s + Number(c.saldo_pendiente), 0);
    const mb = b.contratos.flatMap((ct) => ct.cuotas).reduce((s, c) => s + Number(c.saldo_pendiente), 0);
    return mb - ma;
  });

  return (
    <section className="space-y-6">
      <header>
        <Link href="/bi" className="text-xs text-[var(--muted)] hover:underline">← BI</Link>
        <h2 className="text-2xl font-semibold mt-1">Análisis de cobranza</h2>
      </header>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Cartera total</p>
          <p className="mt-1 text-xl font-bold">{formatCurrency(totalVal)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Eficiencia cobro</p>
          <p className="mt-1 text-xl font-bold text-emerald-600">{eficiencia.toFixed(1)}%</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Tasa mora</p>
          <p className="mt-1 text-xl font-bold text-rose-600">{tasaMora.toFixed(1)}%</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Cartera vencida</p>
          <p className="mt-1 text-xl font-bold text-rose-600">{formatCurrency(vencidaVal)}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="font-semibold mb-2">Distribución cartera</h3>
          <div className="space-y-3">
            {[
              { label: "Pagada", value: pagadaVal, color: "bg-emerald-500" },
              { label: "Pendiente", value: Number(pendiente._sum.saldo_pendiente ?? 0), color: "bg-amber-400" },
              { label: "Vencida", value: vencidaVal, color: "bg-rose-500" },
            ].map(item => (
              <div key={item.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{item.label}</span>
                  <span className="font-medium">{formatCurrency(item.value)} ({totalVal > 0 ? ((item.value / totalVal) * 100).toFixed(1) : 0}%)</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-200">
                  <div className={`h-2 rounded-full ${item.color}`} style={{ width: `${totalVal > 0 ? (item.value / totalVal) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <h3 className="font-semibold text-sm">Top clientes morosos</h3>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-[var(--border)]">
              {topMorosos.map(c => {
                const mora = c.contratos.flatMap((ct) => ct.cuotas).reduce((s, q) => s + Number(q.saldo_pendiente), 0);
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="table-cell">
                      <Link href={`/clientes/${c.id}`} className="hover:underline text-[var(--accent)]">{c.nombre}</Link>
                    </td>
                    <td className="table-cell text-right font-semibold text-rose-600">{formatCurrency(mora)}</td>
                    <td className="table-cell text-right text-xs text-[var(--muted)]">{c.contratos.flatMap((ct) => ct.cuotas).length} cuota(s)</td>
                  </tr>
                );
              })}
              {topMorosos.length === 0 && <tr><td colSpan={3} className="table-cell text-center text-[var(--muted)]">Sin mora.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
