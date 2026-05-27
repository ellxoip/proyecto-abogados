import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";

export default async function MorosidadPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tramo?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const tramo = sp.tramo ? Number(sp.tramo) : 0;

  const hoy = new Date();

  const cuotasVencidas = await prisma.cuota.findMany({
    where: {
      estado: "VENCIDA",
      cobrable: true,
      contrato: {
        cliente: q
          ? { OR: [{ nombre: { contains: q, mode: "insensitive" } }, { rut: { contains: q } }] }
          : undefined,
      },
    },
    include: {
      contrato: {
        include: { cliente: { select: { id: true, nombre: true, rut: true, email: true } } },
      },
    },
    orderBy: { fecha_vencimiento: "asc" },
  });

  type Agrupado = {
    cliente: { id: number; nombre: string; rut: string; email: string | null };
    cuotas: typeof cuotasVencidas;
    totalVencido: number;
    diasMaxMora: number;
    fechaMasAntigua: Date;
  };

  const grouped = cuotasVencidas.reduce<Record<number, Agrupado>>((acc, cuota) => {
    const clienteId = cuota.contrato.cliente.id;
    const dias = Math.floor((hoy.getTime() - cuota.fecha_vencimiento.getTime()) / 86400000);
    if (!acc[clienteId]) {
      acc[clienteId] = {
        cliente: cuota.contrato.cliente,
        cuotas: [],
        totalVencido: 0,
        diasMaxMora: 0,
        fechaMasAntigua: cuota.fecha_vencimiento,
      };
    }
    acc[clienteId].cuotas.push(cuota);
    acc[clienteId].totalVencido += Number(cuota.saldo_pendiente);
    if (dias > acc[clienteId].diasMaxMora) {
      acc[clienteId].diasMaxMora = dias;
      acc[clienteId].fechaMasAntigua = cuota.fecha_vencimiento;
    }
    return acc;
  }, {});

  const rows = Object.values(grouped)
    .filter((g) => g.diasMaxMora >= tramo)
    .sort((a, b) => b.diasMaxMora - a.diasMaxMora);

  const totalDeuda = rows.reduce((s, r) => s + r.totalVencido, 0);
  const totalClientes = rows.length;

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Morosidad</h2>
          <p className="text-sm text-[var(--muted)]">Clientes con cuotas vencidas sin pagar</p>
        </div>
        <div className="flex gap-3">
          <div className="card px-4 py-2 text-sm text-center">
            <p className="text-xs text-[var(--muted)]">Clientes en mora</p>
            <p className="font-bold">{totalClientes}</p>
          </div>
          <div className="card px-4 py-2 text-sm text-center">
            <p className="text-xs text-[var(--muted)]">Deuda total</p>
            <p className="font-bold text-rose-600">{formatCurrency(totalDeuda)}</p>
          </div>
        </div>
      </header>

      <form method="GET" className="flex gap-3 flex-wrap">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar cliente o RUT..."
          className="rounded border border-[var(--border)] px-3 py-2 text-sm min-w-56"
        />
        <select
          name="tramo"
          defaultValue={sp.tramo ?? ""}
          className="rounded border border-[var(--border)] px-3 py-2 text-sm"
        >
          <option value="">Todos los tramos</option>
          <option value="1">1+ días</option>
          <option value="15">15+ días</option>
          <option value="30">30+ días</option>
          <option value="60">60+ días</option>
          <option value="90">90+ días</option>
        </select>
        <button
          type="submit"
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Filtrar
        </button>
        <Link
          href="/cobranza/morosidad"
          className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50"
        >
          Limpiar
        </Link>
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Cliente</th>
              <th className="table-cell text-center font-medium">Cuotas vencidas</th>
              <th className="table-cell text-center font-medium">Cuota más antigua</th>
              <th className="table-cell text-center font-medium">Días mora</th>
              <th className="table-cell text-right font-medium">Deuda vencida</th>
              <th className="table-cell text-left font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.map(({ cliente, cuotas, totalVencido, diasMaxMora, fechaMasAntigua }) => (
              <tr key={cliente.id} className="hover:bg-slate-50">
                <td className="table-cell">
                  <Link
                    href={`/clientes/${cliente.id}`}
                    className="font-medium text-[var(--accent)] hover:underline"
                  >
                    {cliente.nombre}
                  </Link>
                  <p className="text-xs text-[var(--muted)]">{cliente.rut}</p>
                </td>
                <td className="table-cell text-center">
                  <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">
                    {cuotas.length}
                  </span>
                </td>
                <td className="table-cell text-center text-[var(--muted)]">
                  {formatDate(fechaMasAntigua)}
                </td>
                <td className="table-cell text-center">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      diasMaxMora >= 90
                        ? "bg-rose-100 text-rose-700"
                        : diasMaxMora >= 30
                          ? "bg-amber-100 text-amber-700"
                          : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {diasMaxMora}d
                  </span>
                </td>
                <td className="table-cell text-right font-semibold text-rose-600">
                  {formatCurrency(totalVencido)}
                </td>
                <td className="table-cell">
                  <div className="flex gap-2">
                    <Link
                      href={`/gestiones?cliente_id=${cliente.id}`}
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      Gestionar
                    </Link>
                    <Link
                      href={`/clientes/${cliente.id}`}
                      className="text-xs text-[var(--muted)] hover:underline"
                    >
                      Ver cliente
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="table-cell text-center text-[var(--muted)]">
                  Sin clientes en mora.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
