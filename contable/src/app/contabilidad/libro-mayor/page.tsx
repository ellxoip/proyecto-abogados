import type { JSX } from "react";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";

export default async function LibroMayorPage({ searchParams }: { searchParams: Promise<{ cuenta_id?: string; desde?: string; hasta?: string }> }) {
  const sp = await searchParams;
  const cuentaId = sp.cuenta_id ? Number(sp.cuenta_id) : null;
  const desde = sp.desde ? new Date(sp.desde) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const hasta = sp.hasta ? new Date(sp.hasta) : new Date();

  const cuentas = await prisma.cuentaContable.findMany({
    where: { acepta_movimientos: true },
    orderBy: { codigo: "asc" },
    select: { id: true, codigo: true, nombre: true },
  });

  let partidas = null;
  let cuenta = null;
  if (cuentaId) {
    cuenta = await prisma.cuentaContable.findUnique({ where: { id: cuentaId } });
    partidas = await prisma.partidaContable.findMany({
      where: {
        cuenta_id: cuentaId,
        comprobante: { estado: "APROBADO", fecha_comprobante: { gte: desde, lte: hasta } },
      },
      include: {
        comprobante: { select: { numero: true, fecha_comprobante: true, descripcion: true, tipo: { select: { prefijo: true } } } },
      },
      orderBy: { comprobante: { fecha_comprobante: "asc" } },
    });
  }

  const totalDebe = partidas?.filter(p => p.tipo === "DEBE").reduce((s, p) => s + Number(p.monto), 0) ?? 0;
  const totalHaber = partidas?.filter(p => p.tipo === "HABER").reduce((s, p) => s + Number(p.monto), 0) ?? 0;

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">Libro mayor</h2>
        <p className="text-sm text-[var(--muted)]">Movimientos detallados por cuenta contable</p>
      </header>

      <form className="flex gap-3 flex-wrap items-end" method="GET">
        <div>
          <label className="block text-xs text-[var(--muted)] mb-1">Cuenta</label>
          <select name="cuenta_id" defaultValue={sp.cuenta_id ?? ""} className="rounded border border-[var(--border)] px-3 py-2 text-sm min-w-64">
            <option value="">Seleccionar cuenta...</option>
            {cuentas.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--muted)] mb-1">Desde</label>
          <input type="date" name="desde" defaultValue={desde.toISOString().slice(0, 10)} className="rounded border border-[var(--border)] px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-[var(--muted)] mb-1">Hasta</label>
          <input type="date" name="hasta" defaultValue={hasta.toISOString().slice(0, 10)} className="rounded border border-[var(--border)] px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">Ver</button>
      </form>

      {cuenta && partidas && (
        <>
          <div className="card p-4">
            <h3 className="font-semibold">{cuenta.codigo} — {(cuenta as unknown as { nombre: string }).nombre}</h3>
            <div className="mt-2 flex gap-6 text-sm">
              <span>Debe: <strong>{formatCurrency(totalDebe)}</strong></span>
              <span>Haber: <strong>{formatCurrency(totalHaber)}</strong></span>
              <span>Saldo: <strong className={totalDebe - totalHaber >= 0 ? "text-blue-600" : "text-rose-600"}>{formatCurrency(Math.abs(totalDebe - totalHaber))}</strong></span>
            </div>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-[var(--muted)]">
                <tr>
                  <th className="table-cell text-left font-medium">Fecha</th>
                  <th className="table-cell text-left font-medium">Comprobante</th>
                  <th className="table-cell text-left font-medium">Descripción</th>
                  <th className="table-cell text-left font-medium">Glosa</th>
                  <th className="table-cell text-right font-medium">Debe</th>
                  <th className="table-cell text-right font-medium">Haber</th>
                  <th className="table-cell text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {partidas.reduce<{ rows: JSX.Element[]; saldo: number }>((acc, p) => {
                  const debe = p.tipo === "DEBE" ? Number(p.monto) : 0;
                  const haber = p.tipo === "HABER" ? Number(p.monto) : 0;
                  acc.saldo += debe - haber;
                  acc.rows.push(
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="table-cell">{formatDate(p.comprobante.fecha_comprobante)}</td>
                      <td className="table-cell font-mono">{p.comprobante.tipo.prefijo ?? ""}{p.comprobante.numero}</td>
                      <td className="table-cell text-[var(--muted)]">{p.comprobante.descripcion}</td>
                      <td className="table-cell">{p.glosa ?? ""}</td>
                      <td className="table-cell text-right">{debe > 0 ? formatCurrency(debe) : ""}</td>
                      <td className="table-cell text-right">{haber > 0 ? formatCurrency(haber) : ""}</td>
                      <td className={`table-cell text-right font-medium ${acc.saldo >= 0 ? "" : "text-rose-600"}`}>{formatCurrency(Math.abs(acc.saldo))}</td>
                    </tr>
                  );
                  return acc;
                }, { rows: [], saldo: 0 }).rows}
                {partidas.length === 0 && <tr><td colSpan={7} className="table-cell text-center text-[var(--muted)]">Sin movimientos.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!cuentaId && (
        <div className="card p-8 text-center text-sm text-[var(--muted)]">Selecciona una cuenta para ver sus movimientos.</div>
      )}
    </section>
  );
}
