import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { CrearContratoModal } from "@/app/components/crear-contrato-modal";
import { EditarClienteModal } from "@/app/components/editar-cliente-modal";
import { ContactosSection } from "@/app/components/contactos-section";
import { FacturacionSection } from "@/app/components/facturacion-section";

type Props = {
  params: Promise<{ id: string }>;
};

const estadoContratoClass: Record<string, string> = {
  ACTIVO: "bg-emerald-100 text-emerald-700",
  PENDING_INITIAL_PAYMENT: "bg-amber-100 text-amber-700",
  EN_MORA: "bg-rose-100 text-rose-700",
  REPACTADO: "bg-indigo-100 text-indigo-700",
  PAGADO: "bg-slate-200 text-slate-700",
  TERMINADO: "bg-slate-200 text-slate-600",
  ANULADO: "bg-slate-200 text-slate-500",
};

export default async function ClienteDetailPage({ params }: Props) {
  const { id } = await params;
  const clienteId = Number(id);
  if (Number.isNaN(clienteId)) notFound();

  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    include: {
      contratos: {
        include: {
          cuotas: true,
        },
        orderBy: { fecha_contrato: "desc" },
      },
      pagos: {
        orderBy: { fecha_pago: "desc" },
        take: 15,
      },
      contactos: {
        orderBy: [{ es_principal: "desc" }, { nombre: "asc" }],
      },
      datos_facturacion: true,
    },
  });

  if (!cliente) notFound();

  const totalFacturado = cliente.contratos.reduce(
    (acc, contrato) => acc + Number(contrato.monto_ccto),
    0,
  );
  const totalPagado = cliente.pagos.reduce(
    (acc, pago) => acc + Number(pago.monto_pagado),
    0,
  );
  const saldoPendiente = cliente.contratos.reduce(
    (acc, contrato) =>
      acc +
      contrato.cuotas.reduce((s, cuota) => s + Number(cuota.saldo_pendiente), 0),
    0,
  );

  const cuotasVencidas = cliente.contratos
    .flatMap((c) =>
      c.cuotas
        .filter((q) => q.estado === "VENCIDA")
        .map((q) => ({ ...q, contrato_id: c.id, tipo_servicio: c.tipo_servicio })),
    )
    .sort((a, b) => new Date(a.fecha_vencimiento).getTime() - new Date(b.fecha_vencimiento).getTime());

  const facturacionInitial = cliente.datos_facturacion[0] ?? null;

  return (
    <section className="space-y-5">
      <header className="card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">{cliente.nombre}</h2>
            <p className="text-sm text-[var(--muted)]">
              {cliente.rut} · {cliente.email ?? "Sin email"} · {cliente.telefono ?? "Sin teléfono"}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Estado: {cliente.estado} · Ingreso: {formatDate(cliente.fecha_ingreso)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <EditarClienteModal
              cliente={{
                id: cliente.id,
                nombre: cliente.nombre,
                tipo_cliente: cliente.tipo_cliente,
                email: cliente.email,
                telefono: cliente.telefono,
                estado: cliente.estado,
                fecha_ingreso: cliente.fecha_ingreso,
              }}
            />
            <Link
              href="/clientes"
              className="rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:bg-slate-50"
            >
              ← Volver
            </Link>
          </div>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-sm text-[var(--muted)]">Total facturado</p>
          <p className="mt-1 text-xl font-semibold">{formatCurrency(totalFacturado)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-[var(--muted)]">Total pagado</p>
          <p className="mt-1 text-xl font-semibold">{formatCurrency(totalPagado)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-[var(--muted)]">Saldo pendiente</p>
          <p className="mt-1 text-xl font-semibold">{formatCurrency(saldoPendiente)}</p>
        </div>
      </div>

      {cuotasVencidas.length > 0 && (
        <div className="card overflow-x-auto">
          <div className="px-4 pt-4 pb-2 flex items-center gap-2">
            <h3 className="text-lg font-semibold">Cuotas vencidas</h3>
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
              {cuotasVencidas.length}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[var(--muted)]">
              <tr>
                <th className="table-cell font-medium">Contrato</th>
                <th className="table-cell font-medium">Cuota</th>
                <th className="table-cell font-medium">Vencimiento</th>
                <th className="table-cell font-medium">Monto</th>
                <th className="table-cell font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {cuotasVencidas.map((cuota) => (
                <tr key={cuota.id}>
                  <td className="table-cell">
                    <Link href={`/cuotas/${cuota.contrato_id}`} className="text-[var(--accent)] hover:underline">
                      #{cuota.contrato_id} {cuota.tipo_servicio}
                    </Link>
                  </td>
                  <td className="table-cell">#{cuota.numero_cuota}</td>
                  <td className="table-cell text-rose-600">{formatDate(cuota.fecha_vencimiento)}</td>
                  <td className="table-cell">{formatCurrency(Number(cuota.monto_actual))}</td>
                  <td className="table-cell font-medium text-rose-600">{formatCurrency(Number(cuota.saldo_pendiente))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h3 className="text-lg font-semibold">Contratos</h3>
          <CrearContratoModal clienteId={clienteId} />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--muted)]">
            <tr>
              <th className="table-cell font-medium">ID</th>
              <th className="table-cell font-medium">Servicio</th>
              <th className="table-cell font-medium">Fecha</th>
              <th className="table-cell font-medium">Monto</th>
              <th className="table-cell font-medium">Saldo</th>
              <th className="table-cell font-medium">Estado</th>
              <th className="table-cell font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cliente.contratos.map((contrato) => {
              const saldo = contrato.cuotas.reduce(
                (acc, cuota) => acc + Number(cuota.saldo_pendiente),
                0,
              );
              return (
                <tr key={contrato.id}>
                  <td className="table-cell">#{contrato.id}</td>
                  <td className="table-cell">{contrato.tipo_servicio}</td>
                  <td className="table-cell">{formatDate(contrato.fecha_contrato)}</td>
                  <td className="table-cell">{formatCurrency(Number(contrato.monto_ccto))}</td>
                  <td className="table-cell">{formatCurrency(saldo)}</td>
                  <td className="table-cell">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${estadoContratoClass[contrato.estado] ?? "bg-slate-100 text-slate-700"}`}
                    >
                      {contrato.estado}
                    </span>
                  </td>
                  <td className="table-cell">
                    <Link
                      href={`/cuotas/${contrato.id}`}
                      className="text-[var(--accent)] hover:underline"
                    >
                      Ver cuotas
                    </Link>
                  </td>
                </tr>
              );
            })}
            {cliente.contratos.length === 0 && (
              <tr>
                <td className="table-cell text-center text-[var(--muted)]" colSpan={7}>
                  Sin contratos
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <h3 className="px-4 pt-4 text-lg font-semibold">Últimos pagos</h3>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--muted)]">
            <tr>
              <th className="table-cell font-medium">Fecha</th>
              <th className="table-cell font-medium">Contrato</th>
              <th className="table-cell font-medium">Cuota</th>
              <th className="table-cell font-medium">Monto</th>
              <th className="table-cell font-medium">Medio</th>
            </tr>
          </thead>
          <tbody>
            {cliente.pagos.map((pago) => (
              <tr key={pago.id}>
                <td className="table-cell">{formatDate(pago.fecha_pago)}</td>
                <td className="table-cell">
                  <Link href={`/cuotas/${pago.contrato_id}`} className="text-[var(--accent)] hover:underline">
                    #{pago.contrato_id}
                  </Link>
                </td>
                <td className="table-cell">{pago.cuota_id ? `#${pago.cuota_id}` : "-"}</td>
                <td className="table-cell">{formatCurrency(Number(pago.monto_pagado))}</td>
                <td className="table-cell">{pago.medio_pago}</td>
              </tr>
            ))}
            {cliente.pagos.length === 0 && (
              <tr>
                <td className="table-cell text-center text-[var(--muted)]" colSpan={5}>
                  Sin pagos registrados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ContactosSection clienteId={clienteId} initial={cliente.contactos} />

      <FacturacionSection clienteId={clienteId} initial={facturacionInitial} />
    </section>
  );
}
