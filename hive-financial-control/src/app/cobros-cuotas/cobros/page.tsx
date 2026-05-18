import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import { getDeudorEstadoClass, getCobrosOverview } from "@/server/services/cobranza.service";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function asValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CobrosPage({ searchParams }: Props) {
  const sp = await searchParams;
  const data = await getCobrosOverview({
    q: asValue(sp.q),
    estadoCuota: asValue(sp.estadoCuota),
    estadoCobranza: asValue(sp.estadoCobranza) as never,
    vencidas: asValue(sp.vencidas) === "1",
    proximas: asValue(sp.proximas) === "1",
    compromisoActivo: asValue(sp.compromisoActivo) === "1",
    sinGestion: asValue(sp.sinGestion) === "1",
    minMonto: asValue(sp.minMonto) ? Number(asValue(sp.minMonto)) : undefined,
    maxMonto: asValue(sp.maxMonto) ? Number(asValue(sp.maxMonto)) : undefined,
  });

  const grouped = Array.from(
    data.data.reduce((acc, row) => {
      const key = row.clienteId;
      const current = acc.get(key) ?? {
        clienteId: row.clienteId,
        clienteNombre: row.clienteNombre,
        clienteRut: row.clienteRut,
        totalDeuda: 0,
        totalVencido: 0,
        cuotas: [] as typeof data.data,
      };

      current.totalDeuda += row.monto;
      if (row.diasAtraso > 0) current.totalVencido += row.monto;
      current.cuotas.push(row);
      acc.set(key, current);
      return acc;
    }, new Map<number, {
      clienteId: number;
      clienteNombre: string;
      clienteRut: string;
      totalDeuda: number;
      totalVencido: number;
      cuotas: typeof data.data;
    }>()),
  )
    .map(([, value]) => value)
    .sort((a, b) => b.totalVencido - a.totalVencido || b.totalDeuda - a.totalDeuda);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">Cobros y cuotas</h2>
        <p className="text-sm text-[var(--muted)]">Bandeja operativa diaria de cobranza</p>
      </header>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
        <div className="card p-4"><p className="text-xs text-[var(--muted)]">Cobros pendientes</p><p className="text-xl font-semibold">{data.summary.cobrosPendientes}</p></div>
        <div className="card p-4"><p className="text-xs text-[var(--muted)]">Cobros vencidos</p><p className="text-xl font-semibold text-rose-700">{data.summary.cobrosVencidos}</p></div>
        <div className="card p-4"><p className="text-xs text-[var(--muted)]">Monto por cobrar</p><p className="text-xl font-semibold">{formatCurrency(data.summary.montoTotalPorCobrar)}</p></div>
        <div className="card p-4"><p className="text-xs text-[var(--muted)]">Monto vencido</p><p className="text-xl font-semibold text-rose-700">{formatCurrency(data.summary.montoVencido)}</p></div>
        <div className="card p-4"><p className="text-xs text-[var(--muted)]">Proximos a vencer</p><p className="text-xl font-semibold">{data.summary.proximosAVencer}</p></div>
        <div className="card p-4"><p className="text-xs text-[var(--muted)]">Compromisos hoy</p><p className="text-xl font-semibold">{data.summary.compromisosHoy}</p></div>
        <div className="card p-4"><p className="text-xs text-[var(--muted)]">Pagos en revision</p><p className="text-xl font-semibold text-orange-700">{data.summary.pagosPendientesRevision}</p></div>
      </div>

      <form className="card grid gap-3 p-4 md:grid-cols-6" method="GET">
        <input name="q" defaultValue={asValue(sp.q)} placeholder="Cliente, RUT o contrato" className="rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
        <select name="estadoCuota" defaultValue={asValue(sp.estadoCuota) ?? ""} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"><option value="">Estado cuota</option><option value="PENDIENTE">PENDIENTE</option><option value="PARCIAL">PARCIAL</option><option value="VENCIDA">VENCIDA</option><option value="REPROGRAMADA">EN_REVISION</option></select>
        <select name="estadoCobranza" defaultValue={asValue(sp.estadoCobranza) ?? ""} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"><option value="">Estado cobranza</option><option value="SIN_GESTION">SIN_GESTION</option><option value="CONTACTADO">CONTACTADO</option><option value="COMPROMISO_ACTIVO">COMPROMISO_ACTIVO</option><option value="COMPROMISO_INCUMPLIDO">COMPROMISO_INCUMPLIDO</option><option value="MOROSO">MOROSO</option><option value="CRITICO">CRITICO</option></select>
        <input name="minMonto" defaultValue={asValue(sp.minMonto)} placeholder="Monto minimo" className="rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
        <input name="maxMonto" defaultValue={asValue(sp.maxMonto)} placeholder="Monto maximo" className="rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
        <button className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white" type="submit">Filtrar</button>
      </form>

      <div className="space-y-3">
        {grouped.map((group) => (
          <details key={group.clienteId} className="card overflow-hidden group">
            <summary className="grid cursor-pointer list-none gap-2 border-b border-[var(--border)] px-4 py-4 text-sm hover:bg-slate-50 md:grid-cols-7 md:items-center">
              <div><p className="text-xs text-[var(--muted)]">Cliente</p><p className="font-semibold">{group.clienteNombre}</p><p className="text-xs text-[var(--muted)]">{group.clienteRut}</p></div>
              <div><p className="text-xs text-[var(--muted)]">Cuotas activas</p><p>{group.cuotas.length}</p></div>
              <div><p className="text-xs text-[var(--muted)]">Deuda total</p><p className="font-medium">{formatCurrency(group.totalDeuda)}</p></div>
              <div><p className="text-xs text-[var(--muted)]">Monto vencido</p><p className="font-medium text-rose-700">{formatCurrency(group.totalVencido)}</p></div>
              <div><p className="text-xs text-[var(--muted)]">Compromisos</p><p>{group.cuotas.filter((q) => Boolean(q.compromisoActivo)).length}</p></div>
              <div><p className="text-xs text-[var(--muted)]">Pendiente revision</p><p>{group.cuotas.filter((q) => q.pagoPendienteRevision).length}</p></div>
              <div className="flex items-center justify-end gap-2"><span className="text-xs text-[var(--muted)]">Ver deudas</span><span className="text-xs text-[var(--muted)] transition-transform group-open:rotate-180">v</span></div>
            </summary>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-[var(--muted)]"><tr><th className="table-cell font-medium">Contrato</th><th className="table-cell font-medium">Cuota</th><th className="table-cell font-medium">Monto</th><th className="table-cell font-medium">Vencimiento</th><th className="table-cell font-medium">Dias atraso</th><th className="table-cell font-medium">Estado cuota</th><th className="table-cell font-medium">Estado cobranza</th><th className="table-cell font-medium">Ultima gestion</th><th className="table-cell font-medium">Compromiso</th><th className="table-cell font-medium">Accion</th></tr></thead>
                <tbody>
                  {group.cuotas.map((row) => (
                    <tr key={row.cuotaId} className={row.diasAtraso > 0 ? "bg-rose-50/40" : ""}>
                      <td className="table-cell">{row.contratoNombre}</td>
                      <td className="table-cell">#{row.numeroCuota}</td>
                      <td className="table-cell font-medium">{formatCurrency(row.monto)}</td>
                      <td className="table-cell">{formatDate(new Date(row.fechaVencimiento))}</td>
                      <td className="table-cell">{row.diasAtraso}</td>
                      <td className="table-cell">{row.estadoCuota}</td>
                      <td className="table-cell"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getDeudorEstadoClass(row.estadoCobranza)}`}>{row.estadoCobranza}</span></td>
                      <td className="table-cell">{row.ultimaGestion ?? "Sin gestion"}</td>
                      <td className="table-cell">{row.compromisoActivo ?? "-"}{row.pagoPendienteRevision ? <p className="text-xs font-medium text-orange-700">Pago pendiente revision</p> : null}</td>
                      <td className="table-cell"><div className="flex flex-wrap gap-1"><Link href={`/cuotas/${row.contratoId}`} className="rounded border border-[var(--border)] px-2 py-1 text-xs">Ver cuota</Link><button disabled type="button" className="rounded border border-[var(--border)] px-2 py-1 text-xs">Registrar pago</button><button disabled type="button" className="rounded border border-[var(--border)] px-2 py-1 text-xs">Registrar gestion</button><Link href="/reportes/historial" className="rounded border border-[var(--border)] px-2 py-1 text-xs">Ir historial</Link></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
        {grouped.length === 0 ? (
          <div className="card p-6 text-center text-sm text-[var(--muted)]">
            No hay cobros activos para los filtros aplicados
          </div>
        ) : null}
      </div>
    </section>
  );
}
