import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

export default async function ClienteMoresoDetailPage({ params }: Props) {
  const { id } = await params;
  const clienteId = Number(id);
  if (Number.isNaN(clienteId)) notFound();

  const hoy = new Date();

  const [cliente, cuotasVencidas, gestiones, compromisos] = await Promise.all([
    prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true, nombre: true, rut: true, estado: true, email: true, telefono: true },
    }),
    prisma.cuota.findMany({
      where: {
        contrato: { cliente_id: clienteId },
        estado: { in: ["VENCIDA", "PENDIENTE", "PARCIAL"] },
        cobrable: true,
        fecha_vencimiento: { lt: hoy },
        saldo_pendiente: { gt: 0 },
      },
      include: { contrato: { select: { id: true, tipo_servicio: true } } },
      orderBy: { fecha_vencimiento: "asc" },
    }),
    prisma.gestionCobranza.findMany({
      where: { cliente_id: clienteId },
      include: { usuario: { select: { nombre: true } } },
      orderBy: { fecha_gestion: "desc" },
      take: 50,
    }),
    prisma.compromisoPago.findMany({
      where: { cliente_id: clienteId },
      include: { contrato: { select: { tipo_servicio: true } } },
      orderBy: { fecha_compromiso: "desc" },
      take: 20,
    }),
  ]);

  if (!cliente) notFound();

  const totalVencido = cuotasVencidas.reduce((s, c) => s + Number(c.saldo_pendiente), 0);
  const ultimaGestion = gestiones[0];

  return (
    <section className="space-y-6">
      <header>
        <Link href="/reportes/morosidad" className="text-xs text-[var(--muted)] hover:underline">← Morosidad</Link>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <h2 className="text-2xl font-semibold">{cliente.nombre}</h2>
          <span className="text-sm text-[var(--muted)]">{cliente.rut}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${cliente.estado === "MOROSO" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
            {cliente.estado}
          </span>
        </div>
        {(cliente.email || cliente.telefono) && (
          <p className="text-xs text-[var(--muted)] mt-1">
            {cliente.email && <span className="mr-3">{cliente.email}</span>}
            {cliente.telefono && <span>{cliente.telefono}</span>}
          </p>
        )}
      </header>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Total vencido</p>
          <p className="mt-1 text-xl font-bold text-rose-600">{formatCurrency(totalVencido)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Cuotas vencidas</p>
          <p className="mt-1 text-xl font-bold">{cuotasVencidas.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Gestiones registradas</p>
          <p className="mt-1 text-xl font-bold">{gestiones.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Última gestión</p>
          <p className="mt-1 text-sm font-semibold">
            {ultimaGestion ? formatDate(ultimaGestion.fecha_gestion) : "—"}
          </p>
          {ultimaGestion && (
            <p className="text-xs text-[var(--muted)]">{ultimaGestion.tipo} — {ultimaGestion.resultado.replace("_", " ")}</p>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="font-semibold text-sm">Cuotas vencidas</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Servicio</th>
              <th className="table-cell text-center font-medium">N° cuota</th>
              <th className="table-cell text-left font-medium">Vencimiento</th>
              <th className="table-cell text-center font-medium">Días atraso</th>
              <th className="table-cell text-right font-medium">Monto original</th>
              <th className="table-cell text-right font-medium">Saldo pendiente</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {cuotasVencidas.map(c => {
              const dias = Math.floor((hoy.getTime() - new Date(c.fecha_vencimiento).getTime()) / 86400000);
              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="table-cell text-xs text-[var(--muted)]">{c.contrato.tipo_servicio}</td>
                  <td className="table-cell text-center">{c.numero_cuota}</td>
                  <td className="table-cell text-xs">{formatDate(c.fecha_vencimiento)}</td>
                  <td className="table-cell text-center font-bold text-rose-600">{dias}</td>
                  <td className="table-cell text-right text-[var(--muted)]">{formatCurrency(Number(c.monto_original))}</td>
                  <td className="table-cell text-right font-semibold text-rose-700">{formatCurrency(Number(c.saldo_pendiente))}</td>
                </tr>
              );
            })}
            {cuotasVencidas.length === 0 && (
              <tr><td colSpan={6} className="table-cell text-center text-[var(--muted)]">Sin cuotas vencidas</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="font-semibold text-sm">Historial de gestiones</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Fecha</th>
              <th className="table-cell text-left font-medium">Tipo</th>
              <th className="table-cell text-left font-medium">Resultado</th>
              <th className="table-cell text-left font-medium">Seguimiento</th>
              <th className="table-cell text-left font-medium">Notas</th>
              <th className="table-cell text-left font-medium">Usuario</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {gestiones.map(g => (
              <tr key={g.id} className="hover:bg-slate-50">
                <td className="table-cell text-xs">{formatDate(g.fecha_gestion)}</td>
                <td className="table-cell">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100">{g.tipo}</span>
                </td>
                <td className="table-cell">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${g.resultado === "EXITOSO" ? "bg-emerald-100 text-emerald-700" : g.resultado === "PROMESA_PAGO" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                    {g.resultado.replace("_", " ")}
                  </span>
                </td>
                <td className="table-cell text-xs text-[var(--muted)]">
                  {g.seguimiento_fecha ? formatDate(g.seguimiento_fecha) : "—"}
                </td>
                <td className="table-cell text-xs text-[var(--muted)] max-w-xs truncate">{g.notas ?? "—"}</td>
                <td className="table-cell text-xs text-[var(--muted)]">{g.usuario.nombre}</td>
              </tr>
            ))}
            {gestiones.length === 0 && (
              <tr><td colSpan={6} className="table-cell text-center text-[var(--muted)]">Sin gestiones registradas</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="font-semibold text-sm">Compromisos de pago</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Fecha compromiso</th>
              <th className="table-cell text-left font-medium">Servicio</th>
              <th className="table-cell text-right font-medium">Monto</th>
              <th className="table-cell text-left font-medium">Estado</th>
              <th className="table-cell text-left font-medium">Notas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {compromisos.map(c => {
              const vencido = c.estado === "PENDIENTE" && new Date(c.fecha_compromiso) < hoy;
              return (
                <tr key={c.id} className={vencido ? "bg-rose-50/40" : "hover:bg-slate-50"}>
                  <td className="table-cell text-xs">
                    <span className={vencido ? "text-rose-600 font-medium" : ""}>{formatDate(c.fecha_compromiso)}</span>
                    {vencido && <span className="ml-1 text-xs text-rose-500">vencido</span>}
                  </td>
                  <td className="table-cell text-xs text-[var(--muted)]">{c.contrato.tipo_servicio}</td>
                  <td className="table-cell text-right font-medium">{formatCurrency(Number(c.monto_comprometido))}</td>
                  <td className="table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${c.estado === "CUMPLIDO" ? "bg-emerald-100 text-emerald-700" : c.estado === "INCUMPLIDO" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                      {c.estado}
                    </span>
                  </td>
                  <td className="table-cell text-xs text-[var(--muted)]">{c.notas ?? "—"}</td>
                </tr>
              );
            })}
            {compromisos.length === 0 && (
              <tr><td colSpan={5} className="table-cell text-center text-[var(--muted)]">Sin compromisos registrados</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
