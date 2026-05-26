import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import Link from "next/link";

export default async function ReporteCxPPage() {
  const hoy = new Date();

  const cxp = await prisma.cuentaPorPagar.findMany({
    where: { estado: { in: ["PENDIENTE", "VENCIDA"] } },
    include: {
      proveedor: { select: { nombre: true, rut: true } },
      documento: { select: { tipo: true, numero: true } },
    },
    orderBy: { fecha_vencimiento: "asc" },
  });

  const vencidas = cxp.filter(c => c.estado === "VENCIDA" || new Date(c.fecha_vencimiento) < hoy);
  const proximas = cxp.filter(c => {
    const venc = new Date(c.fecha_vencimiento);
    return venc >= hoy && venc <= new Date(hoy.getTime() + 30 * 24 * 60 * 60 * 1000);
  });

  const totalPendiente = cxp.reduce((s, c) => s + Number(c.monto), 0);
  const totalVencido = vencidas.reduce((s, c) => s + Number(c.monto), 0);

  const porProveedor = Object.values(
    cxp.reduce((acc, c) => {
      const key = c.proveedor_id;
      if (!acc[key]) acc[key] = { nombre: c.proveedor.nombre, rut: c.proveedor.rut, total: 0, items: 0 };
      acc[key].total += Number(c.monto);
      acc[key].items++;
      return acc;
    }, {} as Record<number, { nombre: string; rut: string; total: number; items: number }>)
  ).sort((a, b) => b.total - a.total);

  return (
    <section className="space-y-6">
      <header>
        <Link href="/reportes" className="text-xs text-[var(--muted)] hover:underline">← Reportes</Link>
        <h2 className="mt-1 text-2xl font-semibold">Cuentas por pagar</h2>
        <p className="text-sm text-[var(--muted)]">Deuda vigente con proveedores</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Total pendiente</p>
          <p className="mt-1 text-2xl font-bold">{formatCurrency(totalPendiente)}</p>
          <p className="text-xs text-[var(--muted)] mt-1">{cxp.length} documentos</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Vencido</p>
          <p className="mt-1 text-2xl font-bold text-rose-600">{formatCurrency(totalVencido)}</p>
          <p className="text-xs text-[var(--muted)] mt-1">{vencidas.length} documentos</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Vence próximos 30 días</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{formatCurrency(proximas.reduce((s, c) => s + Number(c.monto), 0))}</p>
          <p className="text-xs text-[var(--muted)] mt-1">{proximas.length} documentos</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="font-semibold text-sm">Por proveedor</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Proveedor</th>
              <th className="table-cell text-center font-medium">Documentos</th>
              <th className="table-cell text-right font-medium">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {porProveedor.map(p => (
              <tr key={p.rut} className="hover:bg-slate-50">
                <td className="table-cell">
                  <p className="font-medium">{p.nombre}</p>
                  <p className="text-xs text-[var(--muted)]">{p.rut}</p>
                </td>
                <td className="table-cell text-center">{p.items}</td>
                <td className="table-cell text-right font-semibold">{formatCurrency(p.total)}</td>
              </tr>
            ))}
            {porProveedor.length === 0 && <tr><td colSpan={3} className="table-cell text-center text-[var(--muted)]">Sin deuda pendiente</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="font-semibold text-sm">Detalle por documento</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Proveedor</th>
              <th className="table-cell text-left font-medium">Documento</th>
              <th className="table-cell text-left font-medium">Vencimiento</th>
              <th className="table-cell text-right font-medium">Monto</th>
              <th className="table-cell text-left font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {cxp.map(c => {
              const vencida = new Date(c.fecha_vencimiento) < hoy;
              return (
                <tr key={c.id} className={`hover:bg-slate-50 ${vencida ? "bg-rose-50/30" : ""}`}>
                  <td className="table-cell">
                    <p className="font-medium">{c.proveedor.nombre}</p>
                    <p className="text-xs text-[var(--muted)]">{c.proveedor.rut}</p>
                  </td>
                  <td className="table-cell text-xs text-[var(--muted)]">
                    {c.documento ? `${c.documento.tipo.replace(/_/g, " ")} #${c.documento.numero ?? "—"}` : "Sin documento"}
                  </td>
                  <td className="table-cell">
                    <span className={vencida ? "text-rose-600 font-medium" : ""}>{formatDate(c.fecha_vencimiento)}</span>
                  </td>
                  <td className="table-cell text-right font-semibold">{formatCurrency(Number(c.monto))}</td>
                  <td className="table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${vencida ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>
                      {vencida ? "VENCIDA" : "PENDIENTE"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {cxp.length === 0 && <tr><td colSpan={5} className="table-cell text-center text-[var(--muted)]">Sin CxP pendiente</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
