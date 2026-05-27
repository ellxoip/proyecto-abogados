import type { JSX } from "react";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";

type PartidaFicha = Prisma.PartidaContableGetPayload<{
  include: {
    comprobante: {
      select: {
        numero: true;
        fecha_comprobante: true;
        descripcion: true;
        tipo: { select: { prefijo: true; nombre: true } };
      };
    };
  };
}>;

export default async function FichaContablePage({
  searchParams,
}: {
  searchParams: Promise<{ cuenta_id?: string; desde?: string; hasta?: string }>;
}) {
  const sp = await searchParams;
  const cuentaId = sp.cuenta_id ? Number(sp.cuenta_id) : null;
  const desde = sp.desde
    ? new Date(sp.desde)
    : new Date(new Date().getFullYear(), 0, 1);
  const hasta = sp.hasta ? new Date(sp.hasta) : new Date();

  const cuentas = await prisma.cuentaContable.findMany({
    where: { acepta_movimientos: true },
    orderBy: { codigo: "asc" },
    select: { id: true, codigo: true, nombre: true },
  });

  let cuenta = null;
  let partidas: PartidaFicha[] = [];

  if (cuentaId) {
    cuenta = await prisma.cuentaContable.findUnique({
      where: { id: cuentaId },
      select: { id: true, codigo: true, nombre: true, tipo: true },
    });
    partidas = await prisma.partidaContable.findMany({
      where: {
        cuenta_id: cuentaId,
        comprobante: {
          estado: "APROBADO",
          fecha_comprobante: { gte: desde, lte: hasta },
        },
      },
      include: {
        comprobante: {
          select: {
            numero: true,
            fecha_comprobante: true,
            descripcion: true,
            tipo: { select: { prefijo: true, nombre: true } },
          },
        },
      },
      orderBy: { comprobante: { fecha_comprobante: "asc" } },
    });
  }

  const totalDebe = partidas
    .filter((p) => p.tipo === "DEBE")
    .reduce((s, p) => s + Number(p.monto), 0);
  const totalHaber = partidas
    .filter((p) => p.tipo === "HABER")
    .reduce((s, p) => s + Number(p.monto), 0);
  const saldoFinal = totalDebe - totalHaber;

  return (
    <section className="space-y-6">
      <header>
        <Link href="/contabilidad" className="text-xs text-[var(--muted)] hover:underline">
          ← Contabilidad
        </Link>
        <h2 className="mt-1 text-2xl font-semibold">Ficha contable</h2>
        <p className="text-sm text-[var(--muted)]">Movimientos detallados por cuenta con saldo acumulado</p>
      </header>

      <form method="GET" className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-[var(--muted)]">Cuenta</label>
          <select
            name="cuenta_id"
            defaultValue={sp.cuenta_id ?? ""}
            className="min-w-72 rounded border border-[var(--border)] px-3 py-2 text-sm"
          >
            <option value="">Seleccionar cuenta...</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--muted)]">Desde</label>
          <input
            type="date"
            name="desde"
            defaultValue={desde.toISOString().slice(0, 10)}
            className="rounded border border-[var(--border)] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--muted)]">Hasta</label>
          <input
            type="date"
            name="hasta"
            defaultValue={hasta.toISOString().slice(0, 10)}
            className="rounded border border-[var(--border)] px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Ver ficha
        </button>
      </form>

      {cuenta && (
        <>
          <div className="card p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-[var(--muted)]">Cuenta</p>
                <h3 className="text-lg font-semibold">
                  {cuenta.codigo} — {cuenta.nombre}
                </h3>
                <p className="text-xs text-[var(--muted)]">Tipo: {cuenta.tipo}</p>
              </div>
              <div className="flex gap-6 text-sm">
                <div className="text-center">
                  <p className="text-xs text-[var(--muted)]">Debe</p>
                  <p className="font-bold text-slate-700">{formatCurrency(totalDebe)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-[var(--muted)]">Haber</p>
                  <p className="font-bold text-slate-700">{formatCurrency(totalHaber)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-[var(--muted)]">Saldo</p>
                  <p className={`font-bold ${saldoFinal >= 0 ? "text-blue-600" : "text-rose-600"}`}>
                    {formatCurrency(Math.abs(saldoFinal))}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-[var(--muted)]">
                <tr>
                  <th className="table-cell text-left font-medium">Fecha</th>
                  <th className="table-cell text-left font-medium">Comprobante</th>
                  <th className="table-cell text-left font-medium">Tipo</th>
                  <th className="table-cell text-left font-medium">Glosa</th>
                  <th className="table-cell text-right font-medium">Debe</th>
                  <th className="table-cell text-right font-medium">Haber</th>
                  <th className="table-cell text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {partidas.reduce<{ rows: JSX.Element[]; saldo: number }>(
                  (acc, p) => {
                    const debe = p.tipo === "DEBE" ? Number(p.monto) : 0;
                    const haber = p.tipo === "HABER" ? Number(p.monto) : 0;
                    acc.saldo += debe - haber;
                    acc.rows.push(
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="table-cell">{formatDate(p.comprobante.fecha_comprobante)}</td>
                        <td className="table-cell font-mono">
                          {p.comprobante.tipo.prefijo ?? ""}{p.comprobante.numero}
                        </td>
                        <td className="table-cell text-[var(--muted)]">{p.comprobante.tipo.nombre}</td>
                        <td className="table-cell">{p.glosa ?? p.comprobante.descripcion}</td>
                        <td className="table-cell text-right text-slate-700">
                          {debe > 0 ? formatCurrency(debe) : ""}
                        </td>
                        <td className="table-cell text-right text-slate-700">
                          {haber > 0 ? formatCurrency(haber) : ""}
                        </td>
                        <td
                          className={`table-cell text-right font-medium ${acc.saldo >= 0 ? "text-blue-700" : "text-rose-600"}`}
                        >
                          {formatCurrency(Math.abs(acc.saldo))}
                        </td>
                      </tr>,
                    );
                    return acc;
                  },
                  { rows: [], saldo: 0 },
                ).rows}
                {partidas.length === 0 && (
                  <tr>
                    <td colSpan={7} className="table-cell text-center text-[var(--muted)]">
                      Sin movimientos en el período.
                    </td>
                  </tr>
                )}
              </tbody>
              {partidas.length > 0 && (
                <tfoot className="bg-slate-50 text-xs font-semibold">
                  <tr>
                    <td colSpan={4} className="table-cell text-right">Totales</td>
                    <td className="table-cell text-right">{formatCurrency(totalDebe)}</td>
                    <td className="table-cell text-right">{formatCurrency(totalHaber)}</td>
                    <td className={`table-cell text-right ${saldoFinal >= 0 ? "text-blue-700" : "text-rose-600"}`}>
                      {formatCurrency(Math.abs(saldoFinal))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}

      {!cuentaId && (
        <div className="card p-8 text-center text-sm text-[var(--muted)]">
          Selecciona una cuenta para ver su ficha contable.
        </div>
      )}
    </section>
  );
}
