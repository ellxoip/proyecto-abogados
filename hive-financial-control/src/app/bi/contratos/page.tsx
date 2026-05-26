import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import Link from "next/link";

export default async function BiContratosPage() {
  const hoy = new Date();
  const en30 = new Date(hoy.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [vigentes, vencidos, proximosVencer] = await Promise.all([
    prisma.contrato.count({ where: { estado: "ACTIVO" } }),
    prisma.contrato.count({ where: { estado: "EN_MORA" } }),
    prisma.cuota.findMany({
      where: { saldo_pendiente: { gt: 0 }, fecha_vencimiento: { gte: hoy, lte: en30 } },
      include: { contrato: { include: { cliente: { select: { nombre: true } } } } },
      orderBy: { fecha_vencimiento: "asc" },
      take: 10,
    }),
  ]);

  const montoContratosActivos = await prisma.cuota.aggregate({
    _sum: { saldo_pendiente: true },
    where: { contrato: { estado: "ACTIVO" } },
  });

  const contratosPorEstado = await prisma.contrato.groupBy({
    by: ["estado"],
    _count: { id: true },
  });

  return (
    <section className="space-y-6">
      <header>
        <Link href="/bi" className="text-xs text-[var(--muted)] hover:underline">← BI</Link>
        <h2 className="text-2xl font-semibold mt-1">Análisis de contratos</h2>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Contratos vigentes</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{vigentes}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Contratos vencidos</p>
          <p className="mt-1 text-2xl font-bold text-slate-500">{vencidos}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Valor cartera activa</p>
          <p className="mt-1 text-2xl font-bold">{formatCurrency(Number(montoContratosActivos._sum.saldo_pendiente ?? 0))}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="font-semibold mb-3">Por estado</h3>
          <div className="space-y-2">
            {contratosPorEstado.map(e => (
              <div key={e.estado} className="flex items-center justify-between">
                <span className="text-sm">{e.estado}</span>
                <span className="font-semibold">{e._count.id}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <h3 className="font-semibold text-sm">Próximos a vencer (30 días)</h3>
          </div>
          {proximosVencer.length === 0 ? (
            <p className="px-4 py-6 text-sm text-center text-[var(--muted)]">Sin contratos próximos a vencer.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-[var(--border)]">
                {proximosVencer.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="table-cell">
                      <Link href={`/cuotas/${c.contrato.id}`} className="text-[var(--accent)] hover:underline">Contrato #{c.contrato.id}</Link>
                      <p className="text-xs text-[var(--muted)]">{c.contrato.cliente.nombre} · {c.contrato.tipo_servicio}</p>
                    </td>
                    <td className="table-cell text-right">
                      <span className="text-amber-600 font-medium">{formatDate(c.fecha_vencimiento)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
