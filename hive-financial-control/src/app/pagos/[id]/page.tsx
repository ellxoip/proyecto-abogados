import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";

type Props = { params: Promise<{ id: string }> };

const estadoClass: Record<string, string> = {
  CONFIRMADO: "bg-emerald-100 text-emerald-700",
  REGISTRADO: "bg-amber-100 text-amber-700",
  RECHAZADO: "bg-rose-100 text-rose-700",
  REVERSADO: "bg-slate-200 text-slate-600",
};

export default async function PagoDetailPage({ params }: Props) {
  const { id } = await params;
  const pagoId = Number(id);
  if (!Number.isFinite(pagoId) || pagoId <= 0) notFound();

  const pago = await prisma.pago.findUnique({
    where: { id: pagoId },
    include: {
      cliente: { select: { id: true, nombre: true, rut: true, email: true } },
      contrato: { select: { id: true, tipo_servicio: true, estado: true } },
      cuota: { select: { id: true, numero_cuota: true, monto_actual: true, saldo_pendiente: true, fecha_vencimiento: true } },
      aplicaciones_pago: {
        include: {
          cuota: { select: { id: true, numero_cuota: true, monto_actual: true } },
        },
        orderBy: { created_at: "asc" },
      },
    },
  });

  if (!pago) notFound();

  return (
    <section className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Pago #{pago.id}</h2>
          <p className="text-sm text-[var(--muted)]">{formatDate(pago.fecha_pago)} · {pago.medio_pago}</p>
        </div>
        <Link href="/pagos" className="rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:bg-slate-50">
          ← Volver
        </Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Monto pagado</p>
          <p className="mt-1 text-2xl font-bold">{formatCurrency(Number(pago.monto_pagado))}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Estado</p>
          <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-sm font-medium ${estadoClass[pago.estado] ?? "bg-slate-100 text-slate-700"}`}>
            {pago.estado}
          </span>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Medio de pago</p>
          <p className="mt-1 text-lg font-semibold">{pago.medio_pago}</p>
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <h3 className="text-lg font-semibold">Detalle</h3>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-[var(--muted)]">Cliente</dt>
            <dd>
              <Link href={`/clientes/${pago.cliente.id}`} className="text-[var(--accent)] hover:underline font-medium">
                {pago.cliente.nombre}
              </Link>
              <span className="ml-2 text-xs text-[var(--muted)]">{pago.cliente.rut}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">Contrato</dt>
            <dd>
              <Link href={`/cuotas/${pago.contrato.id}`} className="text-[var(--accent)] hover:underline">
                #{pago.contrato.id} — {pago.contrato.tipo_servicio}
              </Link>
            </dd>
          </div>
          {pago.cuota && (
            <div>
              <dt className="text-xs text-[var(--muted)]">Cuota</dt>
              <dd>#{pago.cuota.numero_cuota} · vence {formatDate(pago.cuota.fecha_vencimiento)}</dd>
            </div>
          )}
          {pago.referencia && (
            <div>
              <dt className="text-xs text-[var(--muted)]">Referencia</dt>
              <dd className="font-mono text-xs">{pago.referencia}</dd>
            </div>
          )}
          {pago.payment_event_id && (
            <div>
              <dt className="text-xs text-[var(--muted)]">Event ID (PagaCuotas)</dt>
              <dd className="font-mono text-xs">{pago.payment_event_id}</dd>
            </div>
          )}
          {pago.observacion && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-[var(--muted)]">Observación</dt>
              <dd>{pago.observacion}</dd>
            </div>
          )}
          {pago.comprobante_url && (
            <div>
              <dt className="text-xs text-[var(--muted)]">Comprobante</dt>
              <dd>
                <a href={pago.comprobante_url} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline text-xs">
                  Ver comprobante
                </a>
              </dd>
            </div>
          )}
        </dl>
      </div>

      {pago.aplicaciones_pago.length > 0 && (
        <div className="card overflow-x-auto">
          <h3 className="px-4 pt-4 pb-2 text-lg font-semibold">Cuotas aplicadas</h3>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[var(--muted)]">
              <tr>
                <th className="table-cell font-medium">Cuota</th>
                <th className="table-cell font-medium">Monto aplicado</th>
                <th className="table-cell font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {pago.aplicaciones_pago.map((ap) => (
                <tr key={ap.id}>
                  <td className="table-cell">#{ap.cuota.numero_cuota}</td>
                  <td className="table-cell font-medium">{formatCurrency(Number(ap.monto_aplicado))}</td>
                  <td className="table-cell">{formatDate(ap.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
