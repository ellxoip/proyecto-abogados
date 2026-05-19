import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import {
  getGlobalWarningStats,
  getCuotasConWarning,
} from "@/server/services/warnings-query.service";

/**
 * Reporte de Morosidad — fuente única: tabla `CuotaWarning`.
 *
 * Refleja exactamente lo que el cron diario ya emitió:
 *   - Stats top: cuántos W10/W20/W30 emitidos en los últimos 30 días + cuántos
 *     clientes únicos están actualmente en cada nivel.
 *   - Tabla detallada: una fila por cuota vencida, con el nivel de warning
 *     más alto enviado, días de atraso reales y saldo pendiente.
 *
 * Este reporte NO recalcula nada — sólo lee la tabla. Si una cuota aparece
 * aquí sin warning, significa que el cron aún no la ha alcanzado (menos de
 * 10 días atrasada) o que hubo un fallo de envío visible en el log de
 * `ExternalSyncLog(sync_type=cuota_warnings_daily)`.
 */

const LEVEL_LABEL: Record<string, string> = {
  WARNING_10: "10 días",
  WARNING_20: "20 días",
  WARNING_30: "30+ días",
};

const LEVEL_TONE: Record<string, string> = {
  WARNING_10: "bg-amber-100 text-amber-800 border-amber-300",
  WARNING_20: "bg-orange-100 text-orange-800 border-orange-300",
  WARNING_30: "bg-red-100 text-red-800 border-red-300",
};

export default async function ReporteMorosidadPage() {
  const [stats, cuotas] = await Promise.all([
    getGlobalWarningStats(),
    getCuotasConWarning(),
  ]);

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">Morosidad</h2>
        <p className="text-sm text-[var(--muted)]">
          Estado real del ciclo de warnings 10 / 20 / 30 días. Fuente: tabla
          <code className="ml-1 px-1 py-0.5 rounded bg-slate-100 text-xs">CuotaWarning</code>.
        </p>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="W10 últimos 30d"
          value={stats.total_warnings_last_30d.WARNING_10}
          active={stats.active_clients_at_level.WARNING_10}
          tone="amber"
        />
        <StatCard
          label="W20 últimos 30d"
          value={stats.total_warnings_last_30d.WARNING_20}
          active={stats.active_clients_at_level.WARNING_20}
          tone="orange"
        />
        <StatCard
          label="W30 últimos 30d (corte)"
          value={stats.total_warnings_last_30d.WARNING_30}
          active={stats.active_clients_at_level.WARNING_30}
          tone="red"
        />
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Cartera vencida total
          </div>
          <div className="mt-1 text-2xl font-bold text-rose-700">
            {formatCurrency(stats.total_saldo_vencido)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {stats.total_cuotas_vencidas} cuotas vencidas
          </div>
        </div>
      </div>

      {/* Tabla detallada */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--muted)]">
            <tr>
              <th className="table-cell font-medium">Cliente</th>
              <th className="table-cell font-medium">RUT</th>
              <th className="table-cell font-medium">Cuota</th>
              <th className="table-cell font-medium">Vencimiento</th>
              <th className="table-cell font-medium text-center">Días atraso</th>
              <th className="table-cell font-medium">Nivel actual</th>
              <th className="table-cell font-medium text-center">Avisos</th>
              <th className="table-cell font-medium text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {cuotas.length === 0 && (
              <tr>
                <td colSpan={8} className="table-cell text-center text-[var(--muted)]">
                  Sin cuotas vencidas. Cartera al día.
                </td>
              </tr>
            )}
            {cuotas.map((c) => (
              <tr key={c.cuota_id} className="hover:bg-slate-50">
                <td className="table-cell font-medium">
                  <Link
                    href={`/clientes/${c.cliente_id}`}
                    className="hover:text-[var(--accent)] hover:underline"
                  >
                    {c.cliente_nombre}
                  </Link>
                </td>
                <td className="table-cell font-mono text-xs text-slate-600">{c.cliente_rut}</td>
                <td className="table-cell">
                  <Link
                    href={`/cuotas/${c.contrato_id}`}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    #{c.numero_cuota}
                  </Link>
                </td>
                <td className="table-cell text-xs">
                  {new Date(c.fecha_vencimiento).toLocaleDateString("es-CL")}
                </td>
                <td className="table-cell text-center font-bold text-rose-700">
                  {c.dias_atraso}
                </td>
                <td className="table-cell">
                  {c.last_warning_level ? (
                    <span
                      className={`inline-flex px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${LEVEL_TONE[c.last_warning_level]}`}
                    >
                      {LEVEL_LABEL[c.last_warning_level]}
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400">
                      {c.dias_atraso < 10 ? "Sin enviar (< 10 días)" : "Pendiente"}
                    </span>
                  )}
                </td>
                <td className="table-cell text-center text-xs">{c.warnings_enviados}</td>
                <td className="table-cell text-right font-bold text-rose-700">
                  {formatCurrency(c.saldo_pendiente)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  active,
  tone,
}: {
  label: string;
  value: number;
  active: number;
  tone: "amber" | "orange" | "red";
}) {
  const styles = {
    amber: "border-amber-300 bg-amber-50 text-amber-800",
    orange: "border-orange-300 bg-orange-50 text-orange-800",
    red: "border-red-300 bg-red-50 text-red-800",
  }[tone];
  return (
    <div className={`rounded-lg border p-4 ${styles}`}>
      <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      <div className="text-[11px] mt-1 opacity-70">{active} clientes activos en este nivel</div>
    </div>
  );
}
