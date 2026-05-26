import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";

export default async function TesoreriaPage() {
  const [cuentas, movimientos, egresos] = await Promise.all([
    prisma.cuentaBancaria.findMany({
      where: { activa: true },
      include: { banco: true },
    }),
    prisma.movimientoTesoreria.findMany({
      orderBy: { fecha_movimiento: "desc" },
      take: 5,
      include: { cuenta: { include: { banco: true } } },
    }),
    prisma.egresoTesoreria.findMany({
      where: { estado: "PENDIENTE" },
      orderBy: { fecha_vencimiento: "asc" },
      take: 5,
      include: { cuenta: true },
    }),
  ]);

  const totalSaldos = cuentas.reduce((s, c) => s + Number(c.saldo_inicial), 0);
  const ingresosMes = movimientos
    .filter((m) => m.tipo === "INGRESO")
    .reduce((s, m) => s + Number(m.monto), 0);
  const egresosPendientes = egresos.reduce((s, e) => s + Number(e.monto), 0);

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">Tesorería</h2>
        <p className="text-sm text-[var(--muted)]">Control de cuentas bancarias, movimientos y egresos</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Cuentas activas</p>
          <p className="mt-1 text-2xl font-bold">{cuentas.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Saldo inicial total</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{formatCurrency(totalSaldos)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Ingresos recientes</p>
          <p className="mt-1 text-2xl font-bold text-sky-600">{formatCurrency(ingresosMes)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Egresos pendientes</p>
          <p className="mt-1 text-2xl font-bold text-rose-600">{formatCurrency(egresosPendientes)}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Cuentas bancarias</h3>
            <Link href="/tesoreria/cuentas" className="text-xs text-[var(--accent)] hover:underline">Ver todas</Link>
          </div>
          {cuentas.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Sin cuentas configuradas. <Link href="/tesoreria/bancos" className="text-[var(--accent)] hover:underline">Agregar banco</Link></p>
          ) : (
            <div className="space-y-2">
              {cuentas.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{c.nombre}</p>
                    <p className="text-xs text-[var(--muted)]">{c.banco.nombre} — {c.numero_cuenta}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatCurrency(Number(c.saldo_inicial))}</p>
                    <p className="text-xs text-[var(--muted)]">{c.tipo_cuenta}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Últimos movimientos</h3>
            <Link href="/tesoreria/movimientos" className="text-xs text-[var(--accent)] hover:underline">Ver todos</Link>
          </div>
          {movimientos.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Sin movimientos registrados.</p>
          ) : (
            <div className="space-y-2">
              {movimientos.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium truncate max-w-[180px]">{m.descripcion}</p>
                    <p className="text-xs text-[var(--muted)]">{new Date(m.fecha_movimiento).toLocaleDateString("es-CL")}</p>
                  </div>
                  <p className={`font-semibold ${m.tipo === "INGRESO" ? "text-emerald-600" : "text-rose-600"}`}>
                    {m.tipo === "INGRESO" ? "+" : "-"}{formatCurrency(Number(m.monto))}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/tesoreria/movimientos" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Movimientos</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Ingresos y egresos bancarios</p>
        </Link>
        <Link href="/tesoreria/flujo-caja" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Flujo de caja</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Proyección de entradas y salidas</p>
        </Link>
        <Link href="/tesoreria/conciliacion" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Conciliación bancaria</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Comparar cartola vs sistema</p>
        </Link>
      </div>
    </section>
  );
}
