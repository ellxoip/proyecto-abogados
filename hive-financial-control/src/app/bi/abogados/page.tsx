import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";

export default async function BiAbogadosPage() {
  const gestiones = await prisma.gestionCobranza.groupBy({
    by: ["usuario_id"],
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 10,
  });

  const responsableIds = gestiones.map(g => g.usuario_id).filter(Boolean) as number[];
  const usuarios = await prisma.usuario.findMany({
    where: { id: { in: responsableIds } },
    select: { id: true, nombre: true },
  });
  const userMap = Object.fromEntries(usuarios.map(u => [u.id, u.nombre]));

  const compromisosCumplidos = await prisma.compromisoPago.aggregate({
    _count: { id: true },
    where: { estado: "CUMPLIDO" },
  }).catch(() => ({ _count: { id: 0 } }));

  const totalCompromisos = await prisma.compromisoPago.aggregate({ _count: { id: true } }).catch(() => ({ _count: { id: 0 } }));

  return (
    <section className="space-y-6">
      <header>
        <Link href="/bi" className="text-xs text-[var(--muted)] hover:underline">← BI</Link>
        <h2 className="text-2xl font-semibold mt-1">Rendimiento abogados</h2>
        <p className="text-sm text-[var(--muted)]">Gestiones realizadas y efectividad de cobranza</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Compromisos totales</p>
          <p className="mt-1 text-2xl font-bold">{totalCompromisos._count.id}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Tasa cumplimiento</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">
            {totalCompromisos._count.id > 0 ? ((compromisosCumplidos._count.id / totalCompromisos._count.id) * 100).toFixed(1) : 0}%
          </p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="font-semibold text-sm">Gestiones por responsable</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Responsable</th>
              <th className="table-cell text-center font-medium">Gestiones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {gestiones.map(g => (
              <tr key={g.usuario_id} className="hover:bg-slate-50">
                <td className="table-cell">{g.usuario_id ? userMap[g.usuario_id] ?? "Usuario eliminado" : "Sin asignar"}</td>
                <td className="table-cell text-center font-semibold">{g._count.id}</td>
              </tr>
            ))}
            {gestiones.length === 0 && <tr><td colSpan={2} className="table-cell text-center text-[var(--muted)]">Sin datos.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
