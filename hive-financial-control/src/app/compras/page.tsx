import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";

export default async function ComprasPage() {
  const [proveedores, gastosMes, cxpPendiente] = await Promise.all([
    prisma.proveedor.count({ where: { activo: true } }),
    prisma.gastoCompra.aggregate({
      _sum: { monto_total: true },
      where: { fecha_gasto: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
    }),
    prisma.cuentaPorPagar.aggregate({
      _sum: { monto: true },
      where: { estado: { in: ["PENDIENTE", "VENCIDA"] } },
    }),
  ]);

  const vencidas = await prisma.cuentaPorPagar.count({
    where: { estado: "PENDIENTE", fecha_vencimiento: { lt: new Date() } },
  });

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Compras y gastos</h2>
          <p className="text-sm text-[var(--muted)]">Proveedores, facturas de compra, honorarios y cuentas por pagar</p>
        </div>
        <Link href="/compras/gastos" className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Registrar gasto
        </Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Gastos del mes</p>
          <p className="mt-1 text-xl font-bold">{formatCurrency(Number(gastosMes._sum.monto_total ?? 0))}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Cuentas por pagar</p>
          <p className="mt-1 text-xl font-bold text-amber-600">{formatCurrency(Number(cxpPendiente._sum.monto ?? 0))}</p>
          {vencidas > 0 && <p className="text-xs text-rose-500 mt-0.5">{vencidas} vencida(s)</p>}
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Proveedores activos</p>
          <p className="mt-1 text-xl font-bold">{proveedores}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/compras/proveedores" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Proveedores</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Registro y datos de proveedores</p>
        </Link>
        <Link href="/compras/gastos" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Gastos</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Registro de gastos y facturas</p>
        </Link>
        <Link href="/compras/documentos" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Documentos</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Facturas y liquidaciones de compra</p>
        </Link>
        <Link href="/compras/honorarios" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Honorarios</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Honorarios recibidos con retención</p>
        </Link>
        <Link href="/compras/cuentas-por-pagar" className="card p-4 hover:bg-slate-50 transition-colors">
          <p className="font-medium">Cuentas por pagar</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Control de pagos pendientes</p>
        </Link>
      </div>
    </section>
  );
}
