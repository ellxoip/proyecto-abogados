import { TipoCuentaContable } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";

async function getSaldoCuenta(tipo: TipoCuentaContable, hasta: Date): Promise<{ codigo: string; nombre: string; saldo: number }[]> {
  const cuentas = await prisma.cuentaContable.findMany({
    where: { tipo, acepta_movimientos: true },
    include: {
      partidas: {
        where: { comprobante: { estado: "APROBADO", fecha_comprobante: { lte: hasta } } },
        select: { tipo: true, monto: true },
      },
    },
    orderBy: { codigo: "asc" },
  });

  return cuentas.map(c => {
    const debe = c.partidas.filter(p => p.tipo === "DEBE").reduce((s, p) => s + Number(p.monto), 0);
    const haber = c.partidas.filter(p => p.tipo === "HABER").reduce((s, p) => s + Number(p.monto), 0);
    const saldo = c.naturaleza === "DEUDORA" ? debe - haber : haber - debe;
    return { codigo: c.codigo, nombre: c.nombre, saldo };
  }).filter(c => c.saldo !== 0);
}

export default async function BalancePage({ searchParams }: { searchParams: Promise<{ hasta?: string }> }) {
  const sp = await searchParams;
  const hasta = sp.hasta ? new Date(sp.hasta) : new Date();

  const [activos, pasivos, patrimonio] = await Promise.all([
    getSaldoCuenta("ACTIVO", hasta),
    getSaldoCuenta("PASIVO", hasta),
    getSaldoCuenta("PATRIMONIO", hasta),
  ]);

  const totalActivos = activos.reduce((s, c) => s + c.saldo, 0);
  const totalPasivos = pasivos.reduce((s, c) => s + c.saldo, 0);
  const totalPatrimonio = patrimonio.reduce((s, c) => s + c.saldo, 0);

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Balance general</h2>
          <p className="text-sm text-[var(--muted)]">Posición financiera al {hasta.toLocaleDateString("es-CL")}</p>
        </div>
        <form className="flex gap-2 items-end" method="GET">
          <div>
            <label className="block text-xs text-[var(--muted)] mb-1">Al</label>
            <input type="date" name="hasta" defaultValue={hasta.toISOString().slice(0, 10)} className="rounded border border-[var(--border)] px-3 py-1.5 text-sm" />
          </div>
          <button type="submit" className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">Ver</button>
        </form>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <div className="px-4 py-3 bg-blue-50 border-b border-[var(--border)]">
              <h3 className="font-semibold text-blue-700">ACTIVOS</h3>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-[var(--border)]">
                {activos.map(c => (
                  <tr key={c.codigo} className="hover:bg-slate-50">
                    <td className="table-cell font-mono text-xs text-[var(--muted)]">{c.codigo}</td>
                    <td className="table-cell">{c.nombre}</td>
                    <td className="table-cell text-right font-medium">{formatCurrency(c.saldo)}</td>
                  </tr>
                ))}
                <tr className="bg-blue-50 font-bold">
                  <td colSpan={2} className="table-cell">Total activos</td>
                  <td className="table-cell text-right">{formatCurrency(totalActivos)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card overflow-hidden">
            <div className="px-4 py-3 bg-rose-50 border-b border-[var(--border)]">
              <h3 className="font-semibold text-rose-700">PASIVOS</h3>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-[var(--border)]">
                {pasivos.map(c => (
                  <tr key={c.codigo} className="hover:bg-slate-50">
                    <td className="table-cell font-mono text-xs text-[var(--muted)]">{c.codigo}</td>
                    <td className="table-cell">{c.nombre}</td>
                    <td className="table-cell text-right font-medium">{formatCurrency(c.saldo)}</td>
                  </tr>
                ))}
                <tr className="bg-rose-50 font-bold">
                  <td colSpan={2} className="table-cell">Total pasivos</td>
                  <td className="table-cell text-right">{formatCurrency(totalPasivos)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 bg-purple-50 border-b border-[var(--border)]">
              <h3 className="font-semibold text-purple-700">PATRIMONIO</h3>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-[var(--border)]">
                {patrimonio.map(c => (
                  <tr key={c.codigo} className="hover:bg-slate-50">
                    <td className="table-cell font-mono text-xs text-[var(--muted)]">{c.codigo}</td>
                    <td className="table-cell">{c.nombre}</td>
                    <td className="table-cell text-right font-medium">{formatCurrency(c.saldo)}</td>
                  </tr>
                ))}
                <tr className="bg-purple-50 font-bold">
                  <td colSpan={2} className="table-cell">Total patrimonio</td>
                  <td className="table-cell text-right">{formatCurrency(totalPatrimonio)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className={`card p-4 ${Math.abs(totalActivos - totalPasivos - totalPatrimonio) < 1 ? "bg-emerald-50" : "bg-rose-50"}`}>
            <div className="flex justify-between text-sm font-semibold">
              <span>Pasivos + Patrimonio</span>
              <span>{formatCurrency(totalPasivos + totalPatrimonio)}</span>
            </div>
            <p className={`text-xs mt-1 ${Math.abs(totalActivos - totalPasivos - totalPatrimonio) < 1 ? "text-emerald-600" : "text-rose-600"}`}>
              {Math.abs(totalActivos - totalPasivos - totalPatrimonio) < 1 ? "✓ Balance cuadra" : `Diferencia: ${formatCurrency(Math.abs(totalActivos - totalPasivos - totalPatrimonio))}`}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
