import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { EstadoCompromiso } from "@prisma/client";
import { NuevoCompromisoModal } from "@/app/components/nuevo-compromiso-modal";
import { ActualizarCompromisoButton } from "@/app/components/actualizar-compromiso-button";

const estadoClass: Record<EstadoCompromiso, string> = {
  PENDIENTE: "bg-amber-100 text-amber-700",
  CUMPLIDO: "bg-emerald-100 text-emerald-700",
  INCUMPLIDO: "bg-rose-100 text-rose-700",
};

export default async function CompromisosPage() {
  const hoy = new Date();

  const [compromisos, stats] = await Promise.all([
    prisma.compromisoPago.findMany({
      include: {
        cliente: { select: { id: true, nombre: true, rut: true } },
        contrato: { select: { id: true, tipo_servicio: true } },
        cuota: { select: { id: true, numero_cuota: true } },
        usuario: { select: { nombre: true } },
      },
      orderBy: [{ estado: "asc" }, { fecha_compromiso: "asc" }],
      take: 300,
    }),
    prisma.compromisoPago.groupBy({
      by: ["estado"],
      _count: true,
      _sum: { monto_comprometido: true },
    }),
  ]);

  const pendientes = compromisos.filter((c) => c.estado === "PENDIENTE");
  const vencidos = pendientes.filter((c) => new Date(c.fecha_compromiso) < hoy);
  const totalPendiente = pendientes.reduce((s, c) => s + Number(c.monto_comprometido), 0);
  const statsByEstado = Object.fromEntries(stats.map((s) => [s.estado, s]));

  return (
    <section className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Compromisos de pago</h2>
          <p className="text-sm text-[var(--muted)]">Acuerdos pactados con clientes</p>
        </div>
        <NuevoCompromisoModal />
      </header>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Pendientes</p>
          <p className="mt-1 text-xl font-bold">{statsByEstado["PENDIENTE"]?._count ?? 0}</p>
          <p className="text-xs text-[var(--muted)]">{formatCurrency(totalPendiente)} comprometido</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Vencidos sin cumplir</p>
          <p className="mt-1 text-xl font-bold text-rose-600">{vencidos.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Cumplidos</p>
          <p className="mt-1 text-xl font-bold text-emerald-600">{statsByEstado["CUMPLIDO"]?._count ?? 0}</p>
          <p className="text-xs text-[var(--muted)]">{formatCurrency(Number(statsByEstado["CUMPLIDO"]?._sum?.monto_comprometido ?? 0))}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Incumplidos</p>
          <p className="mt-1 text-xl font-bold text-slate-600">{statsByEstado["INCUMPLIDO"]?._count ?? 0}</p>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--muted)]">
            <tr>
              <th className="table-cell font-medium">Cliente</th>
              <th className="table-cell font-medium">Contrato</th>
              <th className="table-cell font-medium">Cuota</th>
              <th className="table-cell font-medium">Fecha compromiso</th>
              <th className="table-cell font-medium">Monto</th>
              <th className="table-cell font-medium">Estado</th>
              <th className="table-cell font-medium">Notas</th>
              <th className="table-cell font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {compromisos.map((c) => {
              const vencido = c.estado === "PENDIENTE" && new Date(c.fecha_compromiso) < hoy;
              return (
                <tr key={c.id} className={vencido ? "bg-rose-50" : "hover:bg-slate-50"}>
                  <td className="table-cell">
                    <Link href={`/clientes/${c.cliente.id}`} className="text-[var(--accent)] hover:underline font-medium">
                      {c.cliente.nombre}
                    </Link>
                    <p className="text-xs text-[var(--muted)]">{c.cliente.rut}</p>
                  </td>
                  <td className="table-cell">
                    <Link href={`/cuotas/${c.contrato.id}`} className="hover:underline text-xs">
                      #{c.contrato.id} {c.contrato.tipo_servicio}
                    </Link>
                  </td>
                  <td className="table-cell text-xs">
                    {c.cuota ? `#${c.cuota.numero_cuota}` : "—"}
                  </td>
                  <td className="table-cell">
                    <span className={vencido ? "text-rose-600 font-medium" : ""}>
                      {formatDate(c.fecha_compromiso)}
                    </span>
                    {vencido && <p className="text-xs text-rose-500">Vencido</p>}
                  </td>
                  <td className="table-cell font-medium">{formatCurrency(Number(c.monto_comprometido))}</td>
                  <td className="table-cell">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${estadoClass[c.estado]}`}>
                      {c.estado}
                    </span>
                  </td>
                  <td className="table-cell text-xs text-[var(--muted)] max-w-[160px] truncate">
                    {c.notas ?? "—"}
                  </td>
                  <td className="table-cell">
                    {c.estado === "PENDIENTE" && (
                      <ActualizarCompromisoButton id={c.id} />
                    )}
                  </td>
                </tr>
              );
            })}
            {compromisos.length === 0 && (
              <tr>
                <td colSpan={8} className="table-cell text-center text-[var(--muted)]">
                  Sin compromisos registrados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
