import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { EstadoPago, Prisma } from "@prisma/client";
import { startOfMonth, endOfMonth } from "date-fns";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function pick(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

const MEDIOS = ["EFECTIVO", "TRANSFERENCIA", "CHEQUE", "TARJETA", "PAGACUOTAS", "OTRO"];

export default async function PagosPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = pick(sp.q)?.trim() ?? "";
  const desde = pick(sp.desde) ?? "";
  const hasta = pick(sp.hasta) ?? "";
  const medio = pick(sp.medio) ?? "";
  const page = Math.max(1, Number(pick(sp.page) ?? "1"));
  const pageSize = 30;

  const dateFilter: Prisma.PagoWhereInput = {
    ...(desde ? { fecha_pago: { gte: new Date(desde) } } : {}),
    ...(hasta ? { fecha_pago: { lte: new Date(hasta + "T23:59:59") } } : {}),
  };

  const where: Prisma.PagoWhereInput = {
    AND: [
      dateFilter,
      medio ? { medio_pago: { contains: medio, mode: "insensitive" } } : {},
      q
        ? {
            OR: [
              { cliente: { nombre: { contains: q, mode: "insensitive" } } },
              { cliente: { rut: { contains: q, mode: "insensitive" } } },
              { contrato: { tipo_servicio: { contains: q, mode: "insensitive" } } },
              { referencia: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };

  const now = new Date();
  const mesStart = startOfMonth(now);
  const mesEnd = endOfMonth(now);

  const [pagos, total, stats, montoMes, pagosMes, porMedio] = await Promise.all([
    prisma.pago.findMany({
      where,
      include: { cliente: { select: { id: true, nombre: true, rut: true } }, contrato: { select: { id: true, tipo_servicio: true } } },
      orderBy: { fecha_pago: "desc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    prisma.pago.count({ where }),
    prisma.pago.aggregate({
      _sum: { monto_pagado: true },
      where,
    }),
    prisma.pago.aggregate({
      _sum: { monto_pagado: true },
      where: { estado: EstadoPago.CONFIRMADO, fecha_pago: { gte: mesStart, lte: mesEnd } },
    }),
    prisma.pago.count({
      where: { estado: EstadoPago.CONFIRMADO, fecha_pago: { gte: mesStart, lte: mesEnd } },
    }),
    prisma.pago.groupBy({
      by: ["medio_pago"],
      _sum: { monto_pagado: true },
      _count: true,
      where: { estado: EstadoPago.CONFIRMADO, fecha_pago: { gte: mesStart, lte: mesEnd } },
      orderBy: { _sum: { monto_pagado: "desc" } },
    }),
  ]);

  const montoFiltrado = Number(stats._sum.monto_pagado ?? 0);
  const montoMesTotal = Number(montoMes._sum.monto_pagado ?? 0);
  const totalPages = Math.ceil(total / pageSize);

  const hasFilters = Boolean(q || desde || hasta || medio);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">Historial de pagos</h2>
        <p className="text-sm text-[var(--muted)]">Registro consolidado de recaudación</p>
      </header>

      {/* Mini-dashboard */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pagos del mes"
          value={pagosMes}
          sub={`${formatCurrency(montoMesTotal)} recaudado`}
        />
        <StatCard
          label="Monto del mes"
          value={formatCurrency(montoMesTotal)}
          sub="pagos confirmados"
        />
        {hasFilters ? (
          <StatCard
            label="Pagos en filtro"
            value={total}
            sub={`${formatCurrency(montoFiltrado)} total`}
          />
        ) : (
          <StatCard
            label="Medio más usado"
            value={porMedio[0]?.medio_pago ?? "—"}
            sub={porMedio[0] ? `${porMedio[0]._count} pagos este mes` : undefined}
          />
        )}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-xs font-medium text-slate-500">Por medio (mes)</p>
          <div className="space-y-1">
            {porMedio.slice(0, 3).map((m) => (
              <div key={m.medio_pago} className="flex items-center justify-between text-xs">
                <span className="text-slate-600">{m.medio_pago}</span>
                <span className="font-medium text-slate-800">{formatCurrency(Number(m._sum.monto_pagado ?? 0))}</span>
              </div>
            ))}
            {porMedio.length === 0 && <p className="text-xs text-slate-400">Sin pagos este mes</p>}
          </div>
        </div>
      </div>

      {/* Filters */}
      <form className="card grid gap-3 p-4 md:grid-cols-5" method="GET">
        <input
          name="q"
          defaultValue={q}
          placeholder="Cliente, RUT, servicio o referencia"
          className="rounded-md border border-[var(--border)] px-3 py-2 text-sm md:col-span-2"
        />
        <select
          name="medio"
          defaultValue={medio}
          className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
        >
          <option value="">Todos los medios</option>
          {MEDIOS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <input
          name="desde"
          type="date"
          defaultValue={desde}
          className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
        />
        <input
          name="hasta"
          type="date"
          defaultValue={hasta}
          className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
        />
        <div className="flex gap-2 md:col-span-5">
          <button
            type="submit"
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
          >
            Filtrar
          </button>
          {hasFilters && (
            <Link
              href="/pagos"
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm"
            >
              Limpiar
            </Link>
          )}
          <p className="ml-auto self-center text-sm text-[var(--muted)]">
            {total} resultado{total !== 1 ? "s" : ""}
            {hasFilters ? " · " + formatCurrency(montoFiltrado) + " total" : ""}
          </p>
        </div>
      </form>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--muted)]">
            <tr>
              <th className="table-cell font-medium">Fecha pago</th>
              <th className="table-cell font-medium">Cliente</th>
              <th className="table-cell font-medium">RUT</th>
              <th className="table-cell font-medium">Servicio</th>
              <th className="table-cell font-medium">Monto</th>
              <th className="table-cell font-medium">Medio</th>
              <th className="table-cell font-medium">Referencia</th>
              <th className="table-cell font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {pagos.map((pago) => (
              <tr key={pago.id} className="hover:bg-slate-50">
                <td className="table-cell">{formatDate(pago.fecha_pago)}</td>
                <td className="table-cell">
                  <Link href={`/clientes/${pago.cliente.id}`} className="text-[var(--accent)] hover:underline">
                    {pago.cliente.nombre}
                  </Link>
                </td>
                <td className="table-cell">{pago.cliente.rut}</td>
                <td className="table-cell">
                  <Link href={`/cuotas/${pago.contrato.id}`} className="hover:underline">
                    {pago.contrato.tipo_servicio}
                  </Link>
                </td>
                <td className="table-cell font-medium">{formatCurrency(Number(pago.monto_pagado))}</td>
                <td className="table-cell">{pago.medio_pago}</td>
                <td className="table-cell">{pago.referencia ?? "-"}</td>
                <td className="table-cell">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    pago.estado === EstadoPago.CONFIRMADO
                      ? "bg-emerald-100 text-emerald-700"
                      : pago.estado === EstadoPago.RECHAZADO || pago.estado === EstadoPago.REVERSADO
                        ? "bg-rose-100 text-rose-700"
                        : "bg-amber-100 text-amber-700"
                  }`}>
                    {pago.estado}
                  </span>
                </td>
              </tr>
            ))}
            {pagos.length === 0 && (
              <tr>
                <td className="table-cell text-center text-[var(--muted)]" colSpan={8}>
                  No hay pagos para los filtros aplicados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-[var(--muted)]">
          <p>Página {page} de {totalPages}</p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`?${new URLSearchParams({ ...(q && { q }), ...(desde && { desde }), ...(hasta && { hasta }), ...(medio && { medio }), page: String(page - 1) })}`}
                className="rounded border border-[var(--border)] px-3 py-1"
              >
                Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`?${new URLSearchParams({ ...(q && { q }), ...(desde && { desde }), ...(hasta && { hasta }), ...(medio && { medio }), page: String(page + 1) })}`}
                className="rounded border border-[var(--border)] px-3 py-1"
              >
                Siguiente
              </Link>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
