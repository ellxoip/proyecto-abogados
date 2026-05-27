import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";

export default async function BiIndicadoresContratoPage() {
  const contratos = await prisma.contrato.findMany({
    include: {
      cliente: { select: { nombre: true } },
      cuotas: { select: { estado: true, monto_original: true, monto_pagado: true, fecha_vencimiento: true } },
      gestiones: { select: { id: true, fecha_gestion: true } },
    },
    orderBy: { created_at: "desc" },
    take: 100,
  });

  const hoy = new Date();

  const stats = contratos.map(c => {
    const total = c.cuotas.reduce((s, q) => s + Number(q.monto_original), 0);
    const cobrado = c.cuotas.reduce((s, q) => s + Number(q.monto_pagado), 0);
    const tasaCobro = total > 0 ? (cobrado / total) * 100 : 0;
    const vencidas = c.cuotas.filter(q => q.estado === "VENCIDA").length;
    const sinGestion = c.gestiones.length === 0;
    const diasDesdeCreacion = Math.floor((hoy.getTime() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24));
    const enRiesgo = vencidas > 0 && sinGestion;
    return { ...c, total, cobrado, tasaCobro, vencidas, sinGestion, diasDesdeCreacion, enRiesgo };
  });

  const enRiesgo = stats.filter(s => s.enRiesgo).length;
  const avgTasa = stats.length > 0 ? stats.reduce((s, c) => s + c.tasaCobro, 0) / stats.length : 0;
  const totalCobrado = stats.reduce((s, c) => s + c.cobrado, 0);
  const totalCartera = stats.reduce((s, c) => s + c.total, 0);

  return (
    <section className="space-y-6">
      <header>
        <Link href="/bi" className="text-xs text-[var(--muted)] hover:underline">← BI</Link>
        <h2 className="text-2xl font-semibold mt-1">Indicadores por contrato</h2>
        <p className="text-sm text-[var(--muted)]">Desempeño y riesgo por contrato</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Contratos analizados</p>
          <p className="mt-1 text-2xl font-bold">{stats.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Tasa cobro promedio</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{avgTasa.toFixed(1)}%</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Contratos en riesgo</p>
          <p className="mt-1 text-2xl font-bold text-rose-600">{enRiesgo}</p>
          <p className="text-xs text-[var(--muted)] mt-1">Vencidas sin gestión</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Cobrado / Cartera</p>
          <p className="mt-1 text-xl font-bold">{formatCurrency(totalCobrado)}</p>
          <p className="text-xs text-[var(--muted)] mt-1">de {formatCurrency(totalCartera)}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="font-semibold text-sm">Desempeño por contrato</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Cliente</th>
              <th className="table-cell text-left font-medium">Servicio</th>
              <th className="table-cell text-right font-medium">Cartera</th>
              <th className="table-cell text-right font-medium">Cobrado</th>
              <th className="table-cell text-center font-medium">Tasa cobro</th>
              <th className="table-cell text-center font-medium">Vencidas</th>
              <th className="table-cell text-center font-medium">Gestiones</th>
              <th className="table-cell text-center font-medium">Riesgo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {stats.map(c => (
              <tr key={c.id} className={`hover:bg-slate-50 ${c.enRiesgo ? "bg-rose-50/20" : ""}`}>
                <td className="table-cell">
                  <Link href={`/contratos/${c.id}`} className="text-[var(--accent)] hover:underline font-medium">
                    {c.cliente.nombre}
                  </Link>
                </td>
                <td className="table-cell text-[var(--muted)] text-xs">{c.tipo_servicio}</td>
                <td className="table-cell text-right">{formatCurrency(c.total)}</td>
                <td className="table-cell text-right text-emerald-600">{formatCurrency(c.cobrado)}</td>
                <td className="table-cell text-center">
                  <div className="flex items-center gap-1 justify-center">
                    <div className="w-16 bg-slate-200 rounded-full h-1.5">
                      <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${Math.min(c.tasaCobro, 100)}%` }} />
                    </div>
                    <span className="text-xs">{c.tasaCobro.toFixed(0)}%</span>
                  </div>
                </td>
                <td className="table-cell text-center">
                  {c.vencidas > 0 ? <span className="text-rose-600 font-semibold">{c.vencidas}</span> : <span className="text-[var(--muted)]">0</span>}
                </td>
                <td className="table-cell text-center text-[var(--muted)]">{c.gestiones.length}</td>
                <td className="table-cell text-center">
                  {c.enRiesgo
                    ? <span className="text-xs text-rose-600 font-medium">RIESGO</span>
                    : <span className="text-xs text-emerald-600">OK</span>}
                </td>
              </tr>
            ))}
            {stats.length === 0 && <tr><td colSpan={8} className="table-cell text-center text-[var(--muted)]">Sin contratos</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
