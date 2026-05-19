import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import { getDeudorEstadoClass, getDeudoresOverview } from "@/server/services/cobranza.service";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function asValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const estadoCobranzaClass: Record<string, string> = {
  SIN_GESTION: "bg-slate-100 text-slate-600",
  CONTACTADO: "bg-sky-100 text-sky-700",
  COMPROMISO_ACTIVO: "bg-emerald-100 text-emerald-700",
  COMPROMISO_INCUMPLIDO: "bg-orange-100 text-orange-700",
  MOROSO: "bg-amber-100 text-amber-700",
  CRITICO: "bg-rose-100 text-rose-700",
};

export default async function DeudoresPage({ searchParams }: Props) {
  const sp = await searchParams;
  const now = new Date();

  const data = await getDeudoresOverview({
    q: asValue(sp.q),
    estadoCobranza: asValue(sp.estadoCobranza) as never,
    soloConCuotasVencidas: asValue(sp.vencidas) === "1",
    minMonto: asValue(sp.minMonto) ? Number(asValue(sp.minMonto)) : undefined,
    maxMonto: asValue(sp.maxMonto) ? Number(asValue(sp.maxMonto)) : undefined,
    minDiasAtraso: asValue(sp.minDias) ? Number(asValue(sp.minDias)) : undefined,
    maxDiasAtraso: asValue(sp.maxDias) ? Number(asValue(sp.maxDias)) : undefined,
    compromisoActivo: asValue(sp.compromisoActivo) === "1",
    compromisoIncumplido: asValue(sp.compromisoIncumplido) === "1",
  });

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">Clientes deudores</h2>
        <p className="text-sm text-[var(--muted)]">Control de deuda y riesgo de cobranza</p>
      </header>

      {/* KPI strip */}
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Total deudores</p>
          <p className="text-xl font-semibold">{data.summary.totalDeudores}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Deuda pendiente</p>
          <p className="text-xl font-semibold">{formatCurrency(data.summary.totalDeuda)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Deuda vencida</p>
          <p className="text-xl font-semibold text-rose-700">{formatCurrency(data.summary.totalDeudaVencida)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Con cuotas vencidas</p>
          <p className="text-xl font-semibold">{data.summary.clientesConCuotasVencidas}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Compromisos incumplidos</p>
          <p className="text-xl font-semibold text-orange-700">{data.summary.compromisosIncumplidos}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Clientes críticos</p>
          <p className="text-xl font-semibold text-red-700">{data.summary.clientesCriticos}</p>
        </div>
      </div>

      {/* Filtros */}
      <form className="card grid gap-3 p-4 md:grid-cols-4" method="GET">
        <input
          name="q"
          defaultValue={asValue(sp.q)}
          placeholder="Buscar nombre o RUT"
          className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
        />
        <select
          name="estadoCobranza"
          defaultValue={asValue(sp.estadoCobranza) ?? ""}
          className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
        >
          <option value="">Estado cobranza</option>
          <option value="SIN_GESTION">Sin gestión</option>
          <option value="CONTACTADO">Contactado</option>
          <option value="COMPROMISO_ACTIVO">Compromiso activo</option>
          <option value="COMPROMISO_INCUMPLIDO">Compromiso incumplido</option>
          <option value="MOROSO">Moroso</option>
          <option value="CRITICO">Crítico</option>
        </select>
        <select
          name="vencidas"
          defaultValue={asValue(sp.vencidas) ?? ""}
          className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
        >
          <option value="">Todos</option>
          <option value="1">Solo con cuotas vencidas</option>
        </select>
        <div className="flex gap-2">
          <button type="submit" className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white">
            Filtrar
          </button>
          <Link href="/clientes/deudores" className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
            Limpiar
          </Link>
        </div>
      </form>

      <p className="text-sm text-[var(--muted)]">{data.data.length} deudor{data.data.length === 1 ? "" : "es"}</p>

      {/* Tabla */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--muted)]">
            <tr>
              <th className="table-cell font-medium">Cliente</th>
              <th className="table-cell font-medium">Total deuda</th>
              <th className="table-cell font-medium">Deuda por vencer</th>
              <th className="table-cell font-medium text-center">Días sig. cuota</th>
              <th className="table-cell font-medium text-center">Cuotas vencidas</th>
              <th className="table-cell font-medium text-center">Días de atraso</th>
              <th className="table-cell font-medium">Último pago</th>
              <th className="table-cell font-medium">Próxima cuota</th>
              <th className="table-cell font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((row) => {
              const diasProxima = row.proximaCuota
                ? Math.ceil((new Date(row.proximaCuota).getTime() - now.getTime()) / 86400000)
                : null;

              return (
                <tr key={row.clienteId} className="hover:bg-slate-50">
                  <td className="table-cell">
                    <Link href={`/clientes/${row.clienteId}`} className="font-medium text-[var(--accent)] hover:underline">
                      {row.nombre}
                    </Link>
                    <p className="text-xs text-[var(--muted)]">{row.rut}</p>
                  </td>
                  <td className="table-cell font-medium">{formatCurrency(row.totalDeuda)}</td>
                  <td className="table-cell">{formatCurrency(row.deudaPorVencer)}</td>
                  <td className="table-cell text-center">
                    {diasProxima === null ? (
                      <span className="text-slate-400">—</span>
                    ) : diasProxima < 0 ? (
                      <span className="font-medium text-rose-600">{Math.abs(diasProxima)}d vencida</span>
                    ) : diasProxima === 0 ? (
                      <span className="font-medium text-orange-600">Hoy</span>
                    ) : (
                      <span className={diasProxima <= 7 ? "font-medium text-amber-600" : "text-slate-700"}>
                        {diasProxima}d
                      </span>
                    )}
                  </td>
                  <td className="table-cell text-center">
                    {row.cuotasVencidas > 0 ? (
                      <span className="font-semibold text-rose-600">{row.cuotasVencidas}</span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="table-cell text-center">
                    {row.diasAtrasoMaximo > 0 ? (
                      <span className={`font-medium ${row.diasAtrasoMaximo >= 90 ? "text-rose-700" : row.diasAtrasoMaximo >= 30 ? "text-orange-600" : "text-amber-600"}`}>
                        {row.diasAtrasoMaximo}d
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="table-cell text-xs">
                    {row.ultimoPago ? formatDate(new Date(row.ultimoPago)) : <span className="text-slate-400">Sin pagos</span>}
                  </td>
                  <td className="table-cell text-xs">
                    {row.proximaCuota ? formatDate(new Date(row.proximaCuota)) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="table-cell">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${estadoCobranzaClass[row.estadoCobranza] ?? getDeudorEstadoClass(row.estadoCobranza)}`}>
                      {row.estadoCobranza.replace("_", " ")}
                    </span>
                  </td>
                </tr>
              );
            })}
            {data.data.length === 0 && (
              <tr>
                <td className="table-cell text-center text-[var(--muted)]" colSpan={9}>
                  No hay deudores para los filtros aplicados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
