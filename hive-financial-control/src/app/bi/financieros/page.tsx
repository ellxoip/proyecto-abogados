import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";

export default async function BiFinancierosPage() {
  const [cuentas, cxpPendiente, cuotasPendientes] = await Promise.all([
    prisma.cuentaBancaria.findMany({ where: { activa: true }, select: { saldo_inicial: true } }),
    prisma.cuentaPorPagar.aggregate({ _sum: { monto: true }, where: { estado: { in: ["PENDIENTE", "VENCIDA"] } } }),
    prisma.cuota.aggregate({ _sum: { saldo_pendiente: true }, where: { estado: { in: ["PENDIENTE", "PARCIAL", "VENCIDA"] } } }),
  ]);

  const liquidez = cuentas.reduce((s, c) => s + Number(c.saldo_inicial), 0);
  const cxp = Number(cxpPendiente._sum.monto ?? 0);
  const porCobrar = Number(cuotasPendientes._sum.saldo_pendiente ?? 0);

  const gastosMes = await prisma.gastoCompra.aggregate({
    _sum: { monto_total: true },
    where: { fecha_gasto: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
  });
  const ingresosMes = await prisma.documentoVenta.aggregate({
    _sum: { monto_total: true },
    where: { estado: "PAGADO", fecha_emision: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
  });

  const gastoMesVal = Number(gastosMes._sum.monto_total ?? 0);
  const ingresoMesVal = Number(ingresosMes._sum.monto_total ?? 0);
  const margenMes = ingresoMesVal > 0 ? ((ingresoMesVal - gastoMesVal) / ingresoMesVal) * 100 : 0;

  const indicators = [
    { label: "Liquidez disponible (bancos)", value: formatCurrency(liquidez), color: "text-emerald-600", desc: "Saldo total en cuentas bancarias" },
    { label: "Por cobrar", value: formatCurrency(porCobrar), color: "text-amber-600", desc: "Cuotas pendientes + vencidas" },
    { label: "CxP pendiente", value: formatCurrency(cxp), color: "text-amber-600", desc: "Obligaciones con proveedores" },
    { label: "Posición neta", value: formatCurrency(porCobrar - cxp), color: porCobrar - cxp >= 0 ? "text-emerald-600" : "text-rose-600", desc: "Por cobrar menos CxP" },
    { label: "Ingresos del mes", value: formatCurrency(ingresoMesVal), color: "text-blue-600", desc: "Documentos pagados en el mes" },
    { label: "Gastos del mes", value: formatCurrency(gastoMesVal), color: "text-orange-600", desc: "Gastos registrados en el mes" },
    { label: "Margen del mes", value: `${margenMes.toFixed(1)}%`, color: margenMes >= 0 ? "text-emerald-600" : "text-rose-600", desc: "(Ingresos - Gastos) / Ingresos" },
  ];

  return (
    <section className="space-y-6">
      <header>
        <Link href="/bi" className="text-xs text-[var(--muted)] hover:underline">← BI</Link>
        <h2 className="text-2xl font-semibold mt-1">Indicadores financieros</h2>
        <p className="text-sm text-[var(--muted)]">Métricas clave de liquidez y rentabilidad</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {indicators.map(ind => (
          <div key={ind.label} className="card p-5">
            <p className="text-xs text-[var(--muted)]">{ind.label}</p>
            <p className={`mt-1 text-2xl font-bold ${ind.color}`}>{ind.value}</p>
            <p className="text-xs text-[var(--muted)] mt-1">{ind.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
