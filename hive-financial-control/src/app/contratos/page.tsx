import Link from "next/link";
import { Prisma, EstadoContrato } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { EditarContratoModal } from "@/app/components/editar-contrato-modal";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function pickFirst(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

const estadoClass: Record<EstadoContrato, string> = {
  ACTIVO: "bg-emerald-100 text-emerald-700",
  PENDING_INITIAL_PAYMENT: "bg-amber-100 text-amber-700",
  EN_MORA: "bg-rose-100 text-rose-700",
  REPACTADO: "bg-indigo-100 text-indigo-700",
  PAGADO: "bg-slate-200 text-slate-700",
  TERMINADO: "bg-slate-200 text-slate-600",
  ANULADO: "bg-slate-200 text-slate-500",
};

export default async function ContratosPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = pickFirst(sp.q)?.trim() ?? "";
  const estado = pickFirst(sp.estado) ?? "";

  const where: Prisma.ContratoWhereInput = {
    AND: [
      q
        ? {
            OR: [
              { tipo_servicio: { contains: q, mode: "insensitive" } },
              { external_id: { contains: q, mode: "insensitive" } },
              { cliente: { nombre: { contains: q, mode: "insensitive" } } },
              { cliente: { rut: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {},
      estado && Object.values(EstadoContrato).includes(estado as EstadoContrato)
        ? { estado: estado as EstadoContrato }
        : {},
    ],
  };

  const contratos = await prisma.contrato.findMany({
    where,
    orderBy: { fecha_contrato: "desc" },
    include: {
      cliente: { select: { id: true, nombre: true, rut: true } },
      cuotas: { select: { saldo_pendiente: true, estado: true } },
    },
    take: 200,
  });

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">Contratos</h2>
        <p className="text-sm text-[var(--muted)]">
          Listado de contratos — {contratos.length} resultado{contratos.length === 1 ? "" : "s"}
        </p>
      </header>

      <form className="card grid gap-3 p-4 md:grid-cols-4" method="GET">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar cliente, RUT o servicio"
          className="rounded-md border border-[var(--border)] px-3 py-2 text-sm md:col-span-2"
        />
        <select
          name="estado"
          defaultValue={estado}
          className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
        >
          <option value="">Todos los estados</option>
          {Object.values(EstadoContrato).map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white"
          >
            Filtrar
          </button>
          <Link
            href="/contratos"
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          >
            Limpiar
          </Link>
        </div>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--muted)]">
            <tr>
              <th className="table-cell font-medium">ID</th>
              <th className="table-cell font-medium">Cliente</th>
              <th className="table-cell font-medium">Servicio</th>
              <th className="table-cell font-medium">Fecha</th>
              <th className="table-cell font-medium">Monto</th>
              <th className="table-cell font-medium">Saldo</th>
              <th className="table-cell font-medium">Estado</th>
              <th className="table-cell font-medium">Acción</th>
            </tr>
          </thead>
          <tbody>
            {contratos.map((contrato) => {
              const saldo = contrato.cuotas.reduce(
                (acc, c) => acc + Number(c.saldo_pendiente),
                0,
              );
              return (
                <tr key={contrato.id}>
                  <td className="table-cell text-xs font-mono">#{contrato.id}</td>
                  <td className="table-cell">
                    <Link
                      href={`/clientes/${contrato.cliente.id}`}
                      className="text-[var(--accent)] hover:underline"
                    >
                      {contrato.cliente.nombre}
                    </Link>
                    <p className="text-xs text-[var(--muted)]">{contrato.cliente.rut}</p>
                  </td>
                  <td className="table-cell">{contrato.tipo_servicio}</td>
                  <td className="table-cell">{formatDate(contrato.fecha_contrato)}</td>
                  <td className="table-cell">{formatCurrency(Number(contrato.monto_ccto))}</td>
                  <td className="table-cell">{formatCurrency(saldo)}</td>
                  <td className="table-cell">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${estadoClass[contrato.estado]}`}
                    >
                      {contrato.estado}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/cuotas/${contrato.id}`}
                        className="text-[var(--accent)] hover:underline text-sm"
                      >
                        Ver cuotas
                      </Link>
                      <EditarContratoModal compact contrato={{
                        id: contrato.id,
                        tipo_servicio: contrato.tipo_servicio,
                        fecha_contrato: contrato.fecha_contrato,
                        monto_ccto: Number(contrato.monto_ccto),
                        cantidad_cuotas_original: contrato.cantidad_cuotas_original,
                        observaciones: contrato.observaciones,
                        estado: contrato.estado,
                      }} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {contratos.length === 0 && (
              <tr>
                <td className="table-cell text-center text-[var(--muted)]" colSpan={8}>
                  Sin contratos
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
