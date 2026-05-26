import Link from "next/link";
import { notFound } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  CuotaUiEstado,
  EstadoFinanciero,
  getContratoCuotasDetalle,
} from "@/server/services/cuotas.service";
import { RegistrarPagoButton } from "@/app/components/registrar-pago-button";
import { EditarContratoModal } from "@/app/components/editar-contrato-modal";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{ contratoId: string }>;
};

const estadoFinancieroClass: Record<EstadoFinanciero, string> = {
  AL_DIA: "bg-emerald-100 text-emerald-700",
  CON_DEUDA: "bg-amber-100 text-amber-700",
  MOROSO: "bg-rose-100 text-rose-700",
  PAGADO: "bg-slate-200 text-slate-700",
  EN_REVISION: "bg-indigo-100 text-indigo-700",
};

const estadoCuotaClass: Record<CuotaUiEstado, string> = {
  PAGADA: "bg-emerald-100 text-emerald-700",
  PENDIENTE: "bg-amber-100 text-amber-700",
  VENCIDA: "bg-rose-100 text-rose-700",
  PAGO_PARCIAL: "bg-sky-100 text-sky-700",
  EN_REVISION: "bg-indigo-100 text-indigo-700",
  ANULADA: "bg-slate-200 text-slate-700",
};

export default async function CuotaContratoDetailPage({ params }: Props) {
  const { contratoId } = await params;
  const id = Number(contratoId);

  if (!Number.isFinite(id) || id <= 0) {
    notFound();
  }

  const [data, contratoRaw, modificaciones] = await Promise.all([
    getContratoCuotasDetalle(id),
    prisma.contrato.findUnique({
      where: { id },
      select: {
        id: true,
        tipo_servicio: true,
        fecha_contrato: true,
        monto_ccto: true,
        cantidad_cuotas_original: true,
        observaciones: true,
        estado: true,
      },
    }),
    prisma.modificacionContrato.findMany({
      where: { contrato_id: id },
      orderBy: { created_at: "desc" },
      take: 30,
      include: { usuario: { select: { nombre: true } } },
    }),
  ]);

  if (!data || !contratoRaw) {
    notFound();
  }

  return (
    <section className="space-y-5">
      <header className="card space-y-2 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Detalle de contrato #{data.contrato.id}</h2>
            <p className="text-sm text-[var(--muted)]">
              Cliente:{" "}
              <Link href={`/clientes/${data.cliente.id}`} className="text-[var(--accent)] hover:underline">
                {data.cliente.nombre}
              </Link>{" "}
              ({data.cliente.rut})
            </p>
            <p className="text-sm text-[var(--muted)]">
              Servicio: {data.contrato.servicio} | Codigo: {data.contrato.codigo}
            </p>
          </div>
          <Link
            href="/cuotas"
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:bg-slate-50"
          >
            ← Cuotas
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
            {data.contrato.estadoContrato}
          </span>
          <span
            className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${estadoFinancieroClass[data.contrato.estadoFinanciero]}`}
          >
            {data.contrato.estadoFinanciero}
          </span>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-sm text-[var(--muted)]">Total contrato</p>
          <p className="mt-1 text-xl font-semibold">{formatCurrency(data.resumen.totalContrato)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-[var(--muted)]">Total pagado</p>
          <p className="mt-1 text-xl font-semibold">{formatCurrency(data.resumen.totalPagado)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-[var(--muted)]">Saldo pendiente</p>
          <p className="mt-1 text-xl font-semibold">{formatCurrency(data.resumen.saldoPendiente)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-[var(--muted)]">Cuotas totales</p>
          <p className="mt-1 text-xl font-semibold">{data.resumen.cuotasTotales}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-[var(--muted)]">Cuotas pagadas</p>
          <p className="mt-1 text-xl font-semibold">{data.resumen.cuotasPagadas}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-[var(--muted)]">Cuotas por pagar</p>
          <p className="mt-1 text-xl font-semibold">{data.resumen.cuotasPorPagar}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-[var(--muted)]">Cuotas vencidas</p>
          <p className="mt-1 text-xl font-semibold">{data.resumen.cuotasVencidas}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-[var(--muted)]">Proximo vencimiento</p>
          <p className="mt-1 text-xl font-semibold">
            {data.resumen.proximoVencimiento
              ? formatDate(new Date(data.resumen.proximoVencimiento))
              : "-"}
          </p>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="mb-4 text-base font-semibold text-slate-700">Acciones del contrato</h3>
        <div className="flex flex-wrap gap-3">
          <RegistrarPagoButton contratoId={data.contrato.id} />
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400 cursor-not-allowed"
          >
            Enviar recordatorio
          </button>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400 cursor-not-allowed"
          >
            Descargar estado de cuenta
          </button>
          <EditarContratoModal
            contrato={{
              id: contratoRaw.id,
              tipo_servicio: contratoRaw.tipo_servicio,
              fecha_contrato: contratoRaw.fecha_contrato,
              monto_ccto: Number(contratoRaw.monto_ccto),
              cantidad_cuotas_original: contratoRaw.cantidad_cuotas_original,
              observaciones: contratoRaw.observaciones,
              estado: contratoRaw.estado,
            }}
          />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--muted)]">
            <tr>
              <th className="table-cell font-medium">Numero</th>
              <th className="table-cell font-medium">Vencimiento</th>
              <th className="table-cell font-medium">Monto cuota</th>
              <th className="table-cell font-medium">Monto pagado</th>
              <th className="table-cell font-medium">Saldo</th>
              <th className="table-cell font-medium">Estado</th>
              <th className="table-cell font-medium">Fecha de pago</th>
            </tr>
          </thead>
          <tbody>
            {data.cuotas.map((cuota) => (
              <tr key={cuota.id}>
                <td className="table-cell">{cuota.numeroCuota}</td>
                <td className="table-cell">{formatDate(new Date(cuota.fechaVencimiento))}</td>
                <td className="table-cell">{formatCurrency(cuota.montoCuota)}</td>
                <td className="table-cell">{formatCurrency(cuota.montoPagado)}</td>
                <td className="table-cell">{formatCurrency(cuota.saldo)}</td>
                <td className="table-cell">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${estadoCuotaClass[cuota.estado]}`}
                  >
                    {cuota.estado}
                  </span>
                </td>
                <td className="table-cell">
                  {cuota.fechaPago ? formatDate(new Date(cuota.fechaPago)) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modificaciones.length > 0 && (
        <div className="card overflow-x-auto">
          <h3 className="px-4 pt-4 pb-2 text-lg font-semibold">Historial de modificaciones</h3>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[var(--muted)]">
              <tr>
                <th className="table-cell font-medium">Fecha</th>
                <th className="table-cell font-medium">Tipo</th>
                <th className="table-cell font-medium">Motivo</th>
                <th className="table-cell font-medium">Usuario</th>
                <th className="table-cell font-medium">Cuota</th>
              </tr>
            </thead>
            <tbody>
              {modificaciones.map((m) => (
                <tr key={m.id}>
                  <td className="table-cell">{formatDate(m.fecha_modificacion)}</td>
                  <td className="table-cell">
                    <span className="inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      {m.tipo_modificacion}
                    </span>
                  </td>
                  <td className="table-cell">{m.motivo}</td>
                  <td className="table-cell">{m.usuario.nombre}</td>
                  <td className="table-cell">{m.cuota_id ? `#${m.cuota_id}` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
