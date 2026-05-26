import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ProveedorDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proveedor = await prisma.proveedor.findUnique({
    where: { id: Number(id) },
    include: {
      gastos: { orderBy: { fecha_gasto: "desc" }, take: 20 },
      documentos: { orderBy: { fecha_emision: "desc" }, take: 10 },
      honorarios: { orderBy: { fecha_emision: "desc" }, take: 10 },
      cuentas_por_pagar: { where: { estado: { in: ["PENDIENTE", "VENCIDA"] } }, orderBy: { fecha_vencimiento: "asc" } },
    },
  });
  if (!proveedor) notFound();

  const totalGastos = proveedor.gastos.reduce((s, g) => s + Number(g.monto_total), 0);
  const cxpTotal = proveedor.cuentas_por_pagar.reduce((s, c) => s + Number(c.monto), 0);

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <Link href="/compras/proveedores" className="text-xs text-[var(--muted)] hover:underline">← Proveedores</Link>
          <h2 className="text-2xl font-semibold mt-1">{proveedor.nombre}</h2>
          <p className="text-sm text-[var(--muted)]">RUT: {proveedor.rut} {proveedor.giro && `· ${proveedor.giro}`}</p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Total gastos</p>
          <p className="mt-1 text-lg font-bold">{formatCurrency(totalGastos)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">CxP pendiente</p>
          <p className="mt-1 text-lg font-bold text-amber-600">{formatCurrency(cxpTotal)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Documentos</p>
          <p className="mt-1 text-lg font-bold">{proveedor.documentos.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Honorarios</p>
          <p className="mt-1 text-lg font-bold">{proveedor.honorarios.length}</p>
        </div>
      </div>

      {proveedor.cuentas_por_pagar.length > 0 && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm">
          <strong>{proveedor.cuentas_por_pagar.length} cuenta(s) por pagar</strong> — Total: {formatCurrency(cxpTotal)}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)]"><p className="text-sm font-medium">Últimos gastos</p></div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-[var(--border)]">
              {proveedor.gastos.map(g => (
                <tr key={g.id} className="hover:bg-slate-50">
                  <td className="table-cell">{formatDate(g.fecha_gasto)}</td>
                  <td className="table-cell">{g.descripcion}</td>
                  <td className="table-cell text-right">{formatCurrency(Number(g.monto_total))}</td>
                  <td className="table-cell text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${g.estado_pago === "PAGADO" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{g.estado_pago}</span>
                  </td>
                </tr>
              ))}
              {proveedor.gastos.length === 0 && <tr><td colSpan={4} className="table-cell text-center text-[var(--muted)]">Sin gastos.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card p-5 space-y-3">
          <p className="text-sm font-medium">Datos bancarios</p>
          {proveedor.banco ? (
            <div className="space-y-1 text-sm">
              <p><span className="text-[var(--muted)]">Banco:</span> {proveedor.banco}</p>
              <p><span className="text-[var(--muted)]">Cuenta:</span> {proveedor.numero_cuenta ?? "—"}</p>
              <p><span className="text-[var(--muted)]">Tipo:</span> {proveedor.tipo_cuenta_pago ?? "—"}</p>
            </div>
          ) : <p className="text-sm text-[var(--muted)]">Sin datos bancarios registrados.</p>}
          <hr className="border-[var(--border)]" />
          <p className="text-sm font-medium">Contacto</p>
          <div className="space-y-1 text-sm">
            <p><span className="text-[var(--muted)]">Email:</span> {proveedor.email ?? "—"}</p>
            <p><span className="text-[var(--muted)]">Teléfono:</span> {proveedor.telefono ?? "—"}</p>
            <p><span className="text-[var(--muted)]">Dirección:</span> {proveedor.direccion ?? "—"}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
