import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import { addMonths, format, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";

async function getFlujoCaja() {
  const hoy = new Date();
  const meses = Array.from({ length: 6 }, (_, i) => {
    const d = addMonths(hoy, i - 1);
    return { inicio: startOfMonth(d), fin: endOfMonth(d), label: format(d, "MMM yyyy", { locale: es }) };
  });

  const [cuotas, egresos] = await Promise.all([
    prisma.cuota.findMany({
      where: {
        estado: { in: ["PENDIENTE", "PARCIAL", "VENCIDA"] },
        cobrable: true,
        saldo_pendiente: { gt: 0 },
      },
      select: { fecha_vencimiento: true, saldo_pendiente: true },
    }),
    prisma.egresoTesoreria.findMany({
      where: { estado: { in: ["PENDIENTE", "APROBADO"] } },
      select: { fecha_vencimiento: true, fecha_egreso: true, monto: true },
    }),
  ]);

  const mesesData = meses.map((mes) => {
    const ingresos = cuotas
      .filter((c) => {
        const f = new Date(c.fecha_vencimiento);
        return f >= mes.inicio && f <= mes.fin;
      })
      .reduce((s, c) => s + Number(c.saldo_pendiente), 0);

    const gastos = egresos
      .filter((e) => {
        const f = new Date(e.fecha_vencimiento ?? e.fecha_egreso);
        return f >= mes.inicio && f <= mes.fin;
      })
      .reduce((s, e) => s + Number(e.monto), 0);

    return { ...mes, ingresos, gastos, neto: ingresos - gastos };
  });

  return mesesData;
}

export default async function FlujoCajaPage() {
  const meses = await getFlujoCaja();
  const totalIngresos = meses.reduce((s, m) => s + m.ingresos, 0);
  const totalGastos = meses.reduce((s, m) => s + m.gastos, 0);

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">Flujo de caja</h2>
        <p className="text-sm text-[var(--muted)]">Proyección de ingresos esperados vs egresos programados (6 meses)</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Ingresos esperados (6m)</p>
          <p className="mt-1 text-xl font-bold text-emerald-600">{formatCurrency(totalIngresos)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Egresos programados (6m)</p>
          <p className="mt-1 text-xl font-bold text-rose-600">{formatCurrency(totalGastos)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Saldo proyectado neto</p>
          <p className={`mt-1 text-xl font-bold ${totalIngresos - totalGastos >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {formatCurrency(totalIngresos - totalGastos)}
          </p>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--muted)]">
            <tr>
              <th className="table-cell font-medium">Período</th>
              <th className="table-cell font-medium text-right">Ingresos esperados</th>
              <th className="table-cell font-medium text-right">Egresos programados</th>
              <th className="table-cell font-medium text-right">Saldo neto</th>
              <th className="table-cell font-medium">Alerta</th>
            </tr>
          </thead>
          <tbody>
            {meses.map((m) => (
              <tr key={m.label} className="hover:bg-slate-50">
                <td className="table-cell font-medium capitalize">{m.label}</td>
                <td className="table-cell text-right text-emerald-600 font-medium">{formatCurrency(m.ingresos)}</td>
                <td className="table-cell text-right text-rose-600 font-medium">{formatCurrency(m.gastos)}</td>
                <td className={`table-cell text-right font-bold ${m.neto >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {formatCurrency(m.neto)}
                </td>
                <td className="table-cell">
                  {m.neto < 0 && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">Déficit proyectado</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 sm:grid-cols-6">
        {meses.map((m) => {
          const max = Math.max(...meses.map((x) => Math.max(x.ingresos, x.gastos)), 1);
          const hIngreso = Math.max((m.ingresos / max) * 120, 4);
          const hGasto = Math.max((m.gastos / max) * 120, 4);
          return (
            <div key={m.label} className="card p-3 text-center">
              <p className="mb-2 text-xs font-medium capitalize text-[var(--muted)]">{m.label}</p>
              <div className="flex items-end justify-center gap-1" style={{ height: 120 }}>
                <div title="Ingresos" style={{ height: hIngreso }} className="w-5 rounded-t bg-emerald-400" />
                <div title="Egresos" style={{ height: hGasto }} className="w-5 rounded-t bg-rose-400" />
              </div>
              <p className={`mt-2 text-xs font-bold ${m.neto >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {formatCurrency(m.neto)}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
