import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import { getCobrosHistorial } from "@/server/services/cobranza.service";
import { prisma } from "@/lib/prisma";
import { EstadoPago } from "@prisma/client";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function asValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function StatCard({ label, value, sub, danger }: { label: string; value: string | number; sub?: string; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${danger ? "text-rose-600" : "text-slate-900"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export default async function CobrosHistorialPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Number(asValue(sp.page) ?? "1");
  const pageSize = Number(asValue(sp.pageSize) ?? "20");
  const desdeVal = asValue(sp.desde);
  const hastaVal = asValue(sp.hasta);

  const dateWhere = {
    ...(desdeVal ? { gte: new Date(desdeVal) } : {}),
    ...(hastaVal ? { lte: new Date(hastaVal + "T23:59:59") } : {}),
  };
  const hasDateFilter = Boolean(desdeVal || hastaVal);

  const [data, totalPagos, montoPagado, totalGestiones] = await Promise.all([
    getCobrosHistorial({
      q: asValue(sp.q),
      tipoEvento: asValue(sp.tipoEvento),
      entidad: asValue(sp.entidad),
      usuario: asValue(sp.usuario),
      origen: asValue(sp.origen),
      desde: desdeVal,
      hasta: hastaVal,
      soloErrores: asValue(sp.soloErrores) === "1",
      soloPagos: asValue(sp.soloPagos) === "1",
      soloGestiones: asValue(sp.soloGestiones) === "1",
      soloImportaciones: asValue(sp.soloImportaciones) === "1",
      page,
      pageSize,
    }),
    prisma.pago.count({
      where: {
        estado: EstadoPago.CONFIRMADO,
        ...(hasDateFilter ? { fecha_pago: dateWhere } : {}),
      },
    }),
    prisma.pago.aggregate({
      _sum: { monto_pagado: true },
      where: {
        estado: EstadoPago.CONFIRMADO,
        ...(hasDateFilter ? { fecha_pago: dateWhere } : {}),
      },
    }),
    prisma.modificacionContrato.count({
      where: hasDateFilter ? { created_at: dateWhere } : {},
    }),
  ]);

  const montoTotal = Number(montoPagado._sum.monto_pagado ?? 0);
  const totalErrores = data.data.filter((r) => r.tipoEvento.includes("ERROR")).length;

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">Historial operativo</h2>
        <p className="text-sm text-[var(--muted)]">Trazabilidad de clientes, contratos, cuotas, pagos, gestiones e integraciones</p>
      </header>

      {/* Mini-dashboard */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total eventos"
          value={data.pagination.total}
          sub={hasDateFilter ? "en el período filtrado" : "histórico completo"}
        />
        <StatCard
          label="Pagos confirmados"
          value={totalPagos}
          sub={hasDateFilter ? "en el período" : "total"}
        />
        <StatCard
          label="Monto cobrado"
          value={formatCurrency(montoTotal)}
          sub="pagos confirmados"
        />
        <StatCard
          label="Gestiones registradas"
          value={totalGestiones}
          sub="modificaciones de contrato"
        />
      </div>

      {/* Filters */}
      <form className="card p-4" method="GET">
        <div className="grid gap-3 md:grid-cols-6">
          <input
            name="q"
            defaultValue={asValue(sp.q)}
            placeholder="Cliente, contrato, cuota o ID"
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm md:col-span-2"
          />
          <input
            name="tipoEvento"
            defaultValue={asValue(sp.tipoEvento)}
            placeholder="Tipo de evento"
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          />
          <select
            name="origen"
            defaultValue={asValue(sp.origen) ?? ""}
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          >
            <option value="">Todos los orígenes</option>
            <option value="MANUAL">Manual</option>
            <option value="IMPORTACION">Importación</option>
            <option value="PAGACUOTAS">PagaCuotas</option>
            <option value="SISTEMA">Sistema</option>
          </select>
          <input
            name="desde"
            type="date"
            defaultValue={desdeVal}
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          />
          <input
            name="hasta"
            type="date"
            defaultValue={hastaVal}
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-[var(--muted)]">
            <input type="checkbox" name="soloPagos" value="1" defaultChecked={asValue(sp.soloPagos) === "1"} />
            Solo pagos
          </label>
          <label className="flex items-center gap-1.5 text-sm text-[var(--muted)]">
            <input type="checkbox" name="soloErrores" value="1" defaultChecked={asValue(sp.soloErrores) === "1"} />
            Solo errores
          </label>
          <label className="flex items-center gap-1.5 text-sm text-[var(--muted)]">
            <input type="checkbox" name="soloGestiones" value="1" defaultChecked={asValue(sp.soloGestiones) === "1"} />
            Solo gestiones
          </label>
          <div className="ml-auto flex gap-2">
            <button className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white" type="submit">
              Filtrar
            </button>
            <Link href="/reportes/historial" className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
              Limpiar
            </Link>
          </div>
        </div>
      </form>

      {/* Error badge when filtered */}
      {totalErrores > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          <span className="font-semibold">{totalErrores}</span> evento{totalErrores !== 1 ? "s" : ""} con error en la página actual
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--muted)]">
            <tr>
              <th className="table-cell font-medium">Fecha</th>
              <th className="table-cell font-medium">Evento</th>
              <th className="table-cell font-medium">Entidad</th>
              <th className="table-cell font-medium">Cliente</th>
              <th className="table-cell font-medium">Contrato</th>
              <th className="table-cell font-medium">Usuario / Origen</th>
              <th className="table-cell font-medium">Descripción</th>
              <th className="table-cell font-medium">Estado</th>
              <th className="table-cell font-medium">Monto</th>
              <th className="table-cell font-medium">Acción</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((row) => (
              <tr key={row.id} className={row.tipoEvento.includes("ERROR") ? "bg-red-50/60" : ""}>
                <td className="table-cell">{formatDate(new Date(row.fecha))}</td>
                <td className="table-cell">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    row.tipoEvento.includes("ERROR")
                      ? "bg-rose-100 text-rose-700"
                      : row.tipoEvento.includes("PAGO")
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                  }`}>
                    {row.tipoEvento}
                  </span>
                </td>
                <td className="table-cell">{row.entidad}</td>
                <td className="table-cell">{row.clienteNombre ?? "-"}</td>
                <td className="table-cell">{row.contratoNombre ?? "-"}</td>
                <td className="table-cell">
                  {row.usuario ?? "-"}
                  <p className="text-xs text-[var(--muted)]">{row.origen}</p>
                </td>
                <td className="table-cell">{row.descripcion}</td>
                <td className="table-cell">
                  {row.estadoAnterior ?? "-"}
                  {row.estadoNuevo ? ` → ${row.estadoNuevo}` : ""}
                </td>
                <td className="table-cell">
                  {typeof row.monto === "number" ? formatCurrency(row.monto) : "-"}
                </td>
                <td className="table-cell">
                  <div className="flex flex-wrap gap-1">
                    {row.clienteId && (
                      <Link href={`/clientes/${row.clienteId}`} className="rounded border border-[var(--border)] px-2 py-1 text-xs">
                        Ver cliente
                      </Link>
                    )}
                    {row.contratoId && (
                      <Link href={`/cuotas/${row.contratoId}`} className="rounded border border-[var(--border)] px-2 py-1 text-xs">
                        Ver contrato
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {data.data.length === 0 && (
              <tr>
                <td className="table-cell text-center text-[var(--muted)]" colSpan={10}>
                  No hay eventos para los filtros seleccionados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-[var(--muted)]">
        <p>Mostrando {data.data.length} de {data.pagination.total} eventos</p>
        <div className="flex items-center gap-2">
          <Link
            className="rounded border border-[var(--border)] px-3 py-1"
            href={`?page=${Math.max(1, data.pagination.page - 1)}&pageSize=${data.pagination.pageSize}`}
          >
            Anterior
          </Link>
          <span>Página {data.pagination.page}</span>
          <Link
            className="rounded border border-[var(--border)] px-3 py-1"
            href={`?page=${data.pagination.page + 1}&pageSize=${data.pagination.pageSize}`}
          >
            Siguiente
          </Link>
        </div>
      </div>
    </section>
  );
}
