import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";

export default async function ReporteSaldosBancariosPage() {
  const cuentas = await prisma.cuentaBancaria.findMany({
    where: { activa: true },
    include: {
      banco: { select: { nombre: true } },
      movimientos: {
        orderBy: { fecha_movimiento: "desc" },
        take: 5,
        select: { tipo: true, monto: true, descripcion: true, fecha_movimiento: true },
      },
    },
    orderBy: { cuenta_principal: "desc" },
  });

  const hoy = new Date();
  const hace30 = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000);

  const movimientosPorCuenta = await prisma.movimientoTesoreria.groupBy({
    by: ["cuenta_id", "tipo"],
    _sum: { monto: true },
    where: { fecha_movimiento: { gte: hace30 } },
  });

  const movMap: Record<number, { ingresos: number; egresos: number }> = {};
  movimientosPorCuenta.forEach(m => {
    if (!movMap[m.cuenta_id]) movMap[m.cuenta_id] = { ingresos: 0, egresos: 0 };
    if (m.tipo === "INGRESO") movMap[m.cuenta_id].ingresos += Number(m._sum.monto ?? 0);
    else movMap[m.cuenta_id].egresos += Number(m._sum.monto ?? 0);
  });

  const saldoTotal = cuentas.reduce((s, c) => s + Number(c.saldo_inicial), 0);

  return (
    <section className="space-y-6">
      <header>
        <Link href="/reportes" className="text-xs text-[var(--muted)] hover:underline">← Reportes</Link>
        <h2 className="mt-1 text-2xl font-semibold">Saldos bancarios</h2>
        <p className="text-sm text-[var(--muted)]">Saldo actual y evolución por cuenta</p>
      </header>

      <div className="card p-4">
        <p className="text-xs text-[var(--muted)]">Saldo total en cuentas activas</p>
        <p className="mt-1 text-3xl font-bold text-emerald-600">{formatCurrency(saldoTotal)}</p>
        <p className="text-xs text-[var(--muted)] mt-1">{cuentas.length} cuentas activas</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {cuentas.map(c => {
          const mov = movMap[c.id] ?? { ingresos: 0, egresos: 0 };
          return (
            <div key={c.id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold">{c.nombre}</p>
                  <p className="text-xs text-[var(--muted)]">{c.banco.nombre} — {c.tipo_cuenta} — {c.numero_cuenta}</p>
                </div>
                {c.cuenta_principal && (
                  <span className="rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-xs">Principal</span>
                )}
              </div>
              <p className="text-2xl font-bold">{formatCurrency(Number(c.saldo_inicial))}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-[var(--muted)]">Ingresos 30d</p>
                  <p className="font-semibold text-emerald-600">+{formatCurrency(mov.ingresos)}</p>
                </div>
                <div>
                  <p className="text-[var(--muted)]">Egresos 30d</p>
                  <p className="font-semibold text-rose-600">-{formatCurrency(mov.egresos)}</p>
                </div>
              </div>
              {c.movimientos.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs font-medium text-[var(--muted)]">Últimos movimientos</p>
                  {c.movimientos.map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-[var(--muted)] truncate max-w-[60%]">{m.descripcion}</span>
                      <span className={m.tipo === "INGRESO" ? "text-emerald-600" : "text-rose-600"}>
                        {m.tipo === "INGRESO" ? "+" : "-"}{formatCurrency(Number(m.monto))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {cuentas.length === 0 && (
          <div className="card p-8 text-center text-[var(--muted)] sm:col-span-2">Sin cuentas bancarias activas</div>
        )}
      </div>
    </section>
  );
}
