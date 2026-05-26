import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  EstadoFinanciero,
  getCuotasOverview,
} from "@/server/services/cuotas.service";
import { CuotasFilters } from "./CuotasFilters";

const estadoClass: Record<EstadoFinanciero, string> = {
  AL_DIA: "bg-emerald-100 text-emerald-700",
  CON_DEUDA: "bg-amber-100 text-amber-700",
  MOROSO: "bg-rose-100 text-rose-700",
  PAGADO: "bg-slate-200 text-slate-700",
  EN_REVISION: "bg-indigo-100 text-indigo-700",
};

type Props = {
  searchParams: Promise<{ q?: string; estado?: string }>;
};

export default async function CuotasPage({ searchParams }: Props) {
  const { q, estado } = await searchParams;
  const data = await getCuotasOverview();

  const query = q?.trim().toLowerCase() ?? "";
  const estadoFilter = estado as EstadoFinanciero | undefined;

  const clientes = data.clientes.filter((cliente) => {
    const matchQuery =
      !query ||
      cliente.nombre.toLowerCase().includes(query) ||
      cliente.rut.toLowerCase().includes(query);
    const matchEstado = !estadoFilter || cliente.estadoFinanciero === estadoFilter;
    return matchQuery && matchEstado;
  });

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">Cuotas por cliente</h2>
        <p className="text-sm text-[var(--muted)]">
          Vista agrupada por cliente y servicios contratados
        </p>
      </header>

      <CuotasFilters />

      {clientes.length === 0 && data.clientes.length > 0 ? (
        <div className="card p-6 text-sm text-[var(--muted)]">
          Sin resultados para los filtros aplicados.
        </div>
      ) : clientes.length === 0 ? (
        <div className="card p-6 text-sm text-[var(--muted)]">No hay clientes con contratos.</div>
      ) : (
        <div className="space-y-3">
          {clientes.map((cliente) => (
            <details key={cliente.id} className="card overflow-hidden group">
              <summary className="grid cursor-pointer list-none gap-2 border-b border-[var(--border)] px-4 py-4 text-sm hover:bg-slate-50 md:grid-cols-7 md:items-center">
                <div>
                  <p className="text-xs text-[var(--muted)]">Cliente</p>
                  <p className="font-semibold">{cliente.nombre}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">RUT</p>
                  <p>{cliente.rut}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">Servicios</p>
                  <p>{cliente.cantidadServicios}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">Total contratado</p>
                  <p>{formatCurrency(cliente.totalContratado)}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">Total pagado</p>
                  <p>{formatCurrency(cliente.totalPagado)}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">Saldo pendiente</p>
                  <p>{formatCurrency(cliente.saldoPendiente)}</p>
                </div>
                <div className="flex items-center gap-2 md:justify-end">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${estadoClass[cliente.estadoFinanciero]}`}
                  >
                    {cliente.estadoFinanciero}
                  </span>
                  <span className="text-xs text-[var(--muted)] transition-transform group-open:rotate-180">
                    v
                  </span>
                </div>
              </summary>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-[var(--muted)]">
                    <tr>
                      <th className="table-cell font-medium">Servicio</th>
                      <th className="table-cell font-medium">Codigo contrato</th>
                      <th className="table-cell font-medium">Total contrato</th>
                      <th className="table-cell font-medium">Total pagado</th>
                      <th className="table-cell font-medium">Saldo pendiente</th>
                      <th className="table-cell font-medium">Cuotas pagadas</th>
                      <th className="table-cell font-medium">Cuotas pendientes</th>
                      <th className="table-cell font-medium">Cuotas vencidas</th>
                      <th className="table-cell font-medium">Estado contrato</th>
                      <th className="table-cell font-medium">Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cliente.contratos.map((contrato) => (
                      <tr key={contrato.id}>
                        <td className="table-cell font-medium">{contrato.servicio}</td>
                        <td className="table-cell">{contrato.codigo}</td>
                        <td className="table-cell">{formatCurrency(contrato.totalContrato)}</td>
                        <td className="table-cell">{formatCurrency(contrato.totalPagado)}</td>
                        <td className="table-cell">{formatCurrency(contrato.saldoPendiente)}</td>
                        <td className="table-cell">{contrato.cuotasPagadas}</td>
                        <td className="table-cell">{contrato.cuotasPendientes}</td>
                        <td className="table-cell">{contrato.cuotasVencidas}</td>
                        <td className="table-cell">
                          {contrato.estadoContrato} / {contrato.estadoFinanciero}
                        </td>
                        <td className="table-cell">
                          <Link
                            href={`/cuotas/${contrato.id}`}
                            className="text-[var(--accent)] hover:underline"
                          >
                            Ver detalle
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {cliente.contratos.length === 0 && (
                      <tr>
                        <td className="table-cell text-center text-[var(--muted)]" colSpan={10}>
                          El cliente no tiene contratos.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      )}

      <p className="text-xs text-[var(--muted)]">
        Actualizado: {formatDate(new Date(data.generatedAt))}
      </p>
    </section>
  );
}
