import { TipoCuentaContable } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";

async function getSaldoPorTipo(tipo: TipoCuentaContable, desde: Date, hasta: Date) {
  const cuentas = await prisma.cuentaContable.findMany({
    where: { tipo, acepta_movimientos: true },
    include: {
      partidas: {
        where: { comprobante: { estado: "APROBADO", fecha_comprobante: { gte: desde, lte: hasta } } },
        select: { tipo: true, monto: true },
      },
    },
    orderBy: { codigo: "asc" },
  });

  return cuentas.map(c => {
    const debe = c.partidas.filter(p => p.tipo === "DEBE").reduce((s, p) => s + Number(p.monto), 0);
    const haber = c.partidas.filter(p => p.tipo === "HABER").reduce((s, p) => s + Number(p.monto), 0);
    const saldo = c.naturaleza === "ACREEDORA" ? haber - debe : debe - haber;
    return { codigo: c.codigo, nombre: c.nombre, saldo };
  }).filter(c => c.saldo !== 0);
}

export default async function EstadoResultadosPage({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  const sp = await searchParams;
  const desde = sp.desde ? new Date(sp.desde) : new Date(new Date().getFullYear(), 0, 1);
  const hasta = sp.hasta ? new Date(sp.hasta) : new Date();

  const [ingresos, costos, gastos] = await Promise.all([
    getSaldoPorTipo("INGRESO", desde, hasta),
    getSaldoPorTipo("COSTO", desde, hasta),
    getSaldoPorTipo("GASTO", desde, hasta),
  ]);

  const totalIngresos = ingresos.reduce((s, c) => s + c.saldo, 0);
  const totalCostos = costos.reduce((s, c) => s + c.saldo, 0);
  const totalGastos = gastos.reduce((s, c) => s + c.saldo, 0);
  const utilidadBruta = totalIngresos - totalCostos;
  const utilidadNeta = utilidadBruta - totalGastos;

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Estado de resultados</h2>
          <p className="text-sm text-[var(--muted)]">{desde.toLocaleDateString("es-CL")} — {hasta.toLocaleDateString("es-CL")}</p>
        </div>
        <form className="flex gap-2 items-end" method="GET">
          <div>
            <label className="block text-xs text-[var(--muted)] mb-1">Desde</label>
            <input type="date" name="desde" defaultValue={desde.toISOString().slice(0, 10)} className="rounded border border-[var(--border)] px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-[var(--muted)] mb-1">Hasta</label>
            <input type="date" name="hasta" defaultValue={hasta.toISOString().slice(0, 10)} className="rounded border border-[var(--border)] px-3 py-1.5 text-sm" />
          </div>
          <button type="submit" className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">Ver</button>
        </form>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4 bg-emerald-50">
          <p className="text-xs text-emerald-600">Ingresos</p>
          <p className="mt-1 text-xl font-bold text-emerald-700">{formatCurrency(totalIngresos)}</p>
        </div>
        <div className="card p-4 bg-amber-50">
          <p className="text-xs text-amber-600">Costos + Gastos</p>
          <p className="mt-1 text-xl font-bold text-amber-700">{formatCurrency(totalCostos + totalGastos)}</p>
        </div>
        <div className={`card p-4 ${utilidadNeta >= 0 ? "bg-blue-50" : "bg-rose-50"}`}>
          <p className={`text-xs ${utilidadNeta >= 0 ? "text-blue-600" : "text-rose-600"}`}>Resultado neto</p>
          <p className={`mt-1 text-xl font-bold ${utilidadNeta >= 0 ? "text-blue-700" : "text-rose-700"}`}>{formatCurrency(utilidadNeta)}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-[var(--border)]">
            <tr className="bg-emerald-50">
              <td colSpan={2} className="table-cell font-semibold text-emerald-700">INGRESOS</td>
              <td className="table-cell text-right font-semibold text-emerald-700">{formatCurrency(totalIngresos)}</td>
            </tr>
            {ingresos.map(c => (
              <tr key={c.codigo} className="hover:bg-slate-50">
                <td className="table-cell font-mono text-xs text-[var(--muted)] pl-8">{c.codigo}</td>
                <td className="table-cell pl-8">{c.nombre}</td>
                <td className="table-cell text-right">{formatCurrency(c.saldo)}</td>
              </tr>
            ))}

            {costos.length > 0 && (
              <>
                <tr className="bg-orange-50">
                  <td colSpan={2} className="table-cell font-semibold text-orange-700">COSTOS</td>
                  <td className="table-cell text-right font-semibold text-orange-700">-{formatCurrency(totalCostos)}</td>
                </tr>
                {costos.map(c => (
                  <tr key={c.codigo} className="hover:bg-slate-50">
                    <td className="table-cell font-mono text-xs text-[var(--muted)] pl-8">{c.codigo}</td>
                    <td className="table-cell pl-8">{c.nombre}</td>
                    <td className="table-cell text-right text-rose-500">-{formatCurrency(c.saldo)}</td>
                  </tr>
                ))}
              </>
            )}

            <tr className="bg-slate-100">
              <td colSpan={2} className="table-cell font-semibold">Utilidad bruta</td>
              <td className={`table-cell text-right font-semibold ${utilidadBruta >= 0 ? "" : "text-rose-600"}`}>{formatCurrency(utilidadBruta)}</td>
            </tr>

            <tr className="bg-amber-50">
              <td colSpan={2} className="table-cell font-semibold text-amber-700">GASTOS</td>
              <td className="table-cell text-right font-semibold text-amber-700">-{formatCurrency(totalGastos)}</td>
            </tr>
            {gastos.map(c => (
              <tr key={c.codigo} className="hover:bg-slate-50">
                <td className="table-cell font-mono text-xs text-[var(--muted)] pl-8">{c.codigo}</td>
                <td className="table-cell pl-8">{c.nombre}</td>
                <td className="table-cell text-right text-rose-500">-{formatCurrency(c.saldo)}</td>
              </tr>
            ))}

            <tr className={`font-bold text-base ${utilidadNeta >= 0 ? "bg-blue-50" : "bg-rose-50"}`}>
              <td colSpan={2} className="table-cell">RESULTADO DEL PERÍODO</td>
              <td className={`table-cell text-right ${utilidadNeta >= 0 ? "text-blue-700" : "text-rose-700"}`}>{formatCurrency(utilidadNeta)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
