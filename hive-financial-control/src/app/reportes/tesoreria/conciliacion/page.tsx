import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";

export default async function ReporteConciliacionPage() {
  const conciliaciones = await prisma.conciliacionBancaria.findMany({
    include: {
      cuenta: { include: { banco: { select: { nombre: true } } } },
      items: true,
    },
    orderBy: { created_at: "desc" },
    take: 20,
  });

  return (
    <section className="space-y-6">
      <header>
        <Link href="/reportes" className="text-xs text-[var(--muted)] hover:underline">← Reportes</Link>
        <h2 className="mt-1 text-2xl font-semibold">Reporte de conciliación</h2>
        <p className="text-sm text-[var(--muted)]">Resumen de conciliados, pendientes y diferencias</p>
      </header>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="font-semibold text-sm">Conciliaciones</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Cuenta</th>
              <th className="table-cell text-left font-medium">Período</th>
              <th className="table-cell text-right font-medium">Saldo banco</th>
              <th className="table-cell text-right font-medium">Saldo sistema</th>
              <th className="table-cell text-right font-medium">Diferencia</th>
              <th className="table-cell text-center font-medium">Items conciliados</th>
              <th className="table-cell text-center font-medium">Pendientes</th>
              <th className="table-cell text-left font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {conciliaciones.map(c => {
              const conciliados = c.items.filter(i => i.conciliado).length;
              const pendientes = c.items.filter(i => !i.conciliado).length;
              const diferencia = Number(c.diferencia);
              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="table-cell">
                    <p className="font-medium">{c.cuenta.nombre}</p>
                    <p className="text-xs text-[var(--muted)]">{c.cuenta.banco.nombre}</p>
                  </td>
                  <td className="table-cell">{c.periodo}</td>
                  <td className="table-cell text-right">{formatCurrency(Number(c.saldo_banco))}</td>
                  <td className="table-cell text-right">{formatCurrency(Number(c.saldo_sistema))}</td>
                  <td className={`table-cell text-right font-semibold ${Math.abs(diferencia) < 1 ? "text-emerald-600" : "text-rose-600"}`}>
                    {diferencia === 0 ? "—" : formatCurrency(Math.abs(diferencia))}
                  </td>
                  <td className="table-cell text-center text-emerald-600">{conciliados}</td>
                  <td className="table-cell text-center text-amber-600">{pendientes}</td>
                  <td className="table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${c.estado === "CONCILIADO" ? "bg-emerald-50 text-emerald-700" : c.estado === "CON_DIFERENCIAS" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>
                      {c.estado.replace(/_/g, " ")}
                    </span>
                  </td>
                </tr>
              );
            })}
            {conciliaciones.length === 0 && (
              <tr><td colSpan={8} className="table-cell text-center text-[var(--muted)]">Sin conciliaciones registradas</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
