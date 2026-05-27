import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";

export default async function CajaChicaPage() {
  const fondos = await prisma.fondoCajaChica.findMany({
    where: { activo: true },
    include: {
      responsable: { select: { nombre: true } },
      gastos: { orderBy: { fecha_gasto: "desc" }, take: 5 },
      rendiciones: { where: { estado: { in: ["BORRADOR", "ENVIADA"] } } },
    },
  });

  const totalAsignado = fondos.reduce((s, f) => s + Number(f.monto_asignado), 0);
  const totalDisponible = fondos.reduce((s, f) => s + Number(f.saldo_actual), 0);
  const totalUsado = totalAsignado - totalDisponible;

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Caja chica</h2>
          <p className="text-sm text-[var(--muted)]">Gestión de fondos para gastos menores</p>
        </div>
        <Link href="/tesoreria/caja-chica/fondos" className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Administrar fondos
        </Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Total asignado</p>
          <p className="mt-1 text-xl font-bold">{formatCurrency(totalAsignado)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Disponible</p>
          <p className="mt-1 text-xl font-bold text-emerald-600">{formatCurrency(totalDisponible)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Usado</p>
          <p className="mt-1 text-xl font-bold text-amber-600">{formatCurrency(totalUsado)}</p>
        </div>
      </div>

      {fondos.length === 0 ? (
        <div className="card p-6 text-center text-sm text-[var(--muted)]">
          Sin fondos configurados. <Link href="/tesoreria/caja-chica/fondos" className="text-[var(--accent)] hover:underline">Crear fondo</Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {fondos.map((f) => {
            const pct = Number(f.monto_asignado) > 0 ? (Number(f.saldo_actual) / Number(f.monto_asignado)) * 100 : 0;
            const pendientes = f.rendiciones.length;
            return (
              <div key={f.id} className="card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{f.nombre}</h3>
                  {pendientes > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{pendientes} rendición pendiente</span>
                  )}
                </div>
                <p className="text-xs text-[var(--muted)]">Responsable: {f.responsable.nombre}</p>
                <div>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-[var(--muted)]">Disponible</span>
                    <span className="font-medium">{formatCurrency(Number(f.saldo_actual))} / {formatCurrency(Number(f.monto_asignado))}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-200">
                    <div className={`h-2 rounded-full ${pct > 50 ? "bg-emerald-500" : pct > 20 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="flex gap-2 text-xs">
                  <Link href={`/tesoreria/caja-chica/gastos?fondo=${f.id}`} className="text-[var(--accent)] hover:underline">Ver gastos</Link>
                  <span className="text-[var(--muted)]">·</span>
                  <Link href="/tesoreria/caja-chica/rendiciones" className="text-[var(--accent)] hover:underline">Rendiciones</Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/tesoreria/caja-chica/gastos" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Gastos</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Registrar gasto de caja chica</p>
        </Link>
        <Link href="/tesoreria/caja-chica/rendiciones" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Rendiciones</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Cerrar período y solicitar aprobación</p>
        </Link>
        <Link href="/tesoreria/caja-chica/reposiciones" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Reposiciones</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Solicitar recarga del fondo</p>
        </Link>
      </div>
    </section>
  );
}
