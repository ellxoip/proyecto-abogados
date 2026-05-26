import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";

export default async function ContabilidadPage() {
  const [cuentas, comprobantes, cierres] = await Promise.all([
    prisma.cuentaContable.count({ where: { activa: true } }),
    prisma.comprobanteContable.count({ where: { estado: "BORRADOR" } }),
    prisma.cierreContable.findFirst({ orderBy: { periodo: "desc" } }),
  ]);

  const totalDebe = await prisma.partidaContable.aggregate({
    _sum: { monto: true },
    where: { tipo: "DEBE", comprobante: { estado: "APROBADO" } },
  });

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">Contabilidad</h2>
        <p className="text-sm text-[var(--muted)]">Plan de cuentas, comprobantes, libros y cierres</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Cuentas activas</p>
          <p className="mt-1 text-xl font-bold">{cuentas}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Comprobantes en borrador</p>
          <p className="mt-1 text-xl font-bold text-amber-600">{comprobantes}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Último cierre</p>
          <p className="mt-1 text-lg font-bold">{cierres?.periodo ?? "Sin cierres"}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/contabilidad/plan-cuentas" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Plan de cuentas</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Árbol de cuentas contables</p>
        </Link>
        <Link href="/contabilidad/comprobantes" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Comprobantes</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Asientos contables</p>
        </Link>
        <Link href="/contabilidad/libro-diario" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Libro diario</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Movimientos cronológicos</p>
        </Link>
        <Link href="/contabilidad/libro-mayor" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Libro mayor</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Movimientos por cuenta</p>
        </Link>
        <Link href="/contabilidad/balance" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Balance</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Activos, pasivos y patrimonio</p>
        </Link>
        <Link href="/contabilidad/estado-resultados" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Estado de resultados</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Ingresos y gastos del período</p>
        </Link>
        <Link href="/contabilidad/cierres" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Cierres</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Cierres mensuales y anuales</p>
        </Link>
        <Link href="/contabilidad/tipos-comprobante" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Tipos de comprobante</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Configurar tipos de asientos</p>
        </Link>
      </div>
    </section>
  );
}
