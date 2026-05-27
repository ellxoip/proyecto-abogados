import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function ReporteAuditoriaPage({ searchParams }: { searchParams: { desde?: string; hasta?: string; tipo?: string } }) {
  const hoy = new Date();
  const hace7 = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000);

  const desde = searchParams.desde ? new Date(searchParams.desde) : hace7;
  const hasta = searchParams.hasta ? new Date(searchParams.hasta + "T23:59:59") : new Date(hoy.toISOString().slice(0, 10) + "T23:59:59");
  const tipo = searchParams.tipo;

  const modificaciones = await prisma.modificacionContrato.findMany({
    where: {
      created_at: { gte: desde, lte: hasta },
      ...(tipo ? { tipo_modificacion: tipo as never } : {}),
    },
    include: {
      contrato: { include: { cliente: { select: { nombre: true } } } },
      usuario: { select: { nombre: true } },
      aprobador: { select: { nombre: true } },
    },
    orderBy: { created_at: "desc" },
    take: 200,
  });

  return (
    <section className="space-y-6">
      <header>
        <Link href="/reportes" className="text-xs text-[var(--muted)] hover:underline">← Reportes</Link>
        <h2 className="mt-1 text-2xl font-semibold">Auditoría de cambios</h2>
        <p className="text-sm text-[var(--muted)]">Modificaciones a contratos — quién modificó qué y cuándo</p>
      </header>

      <form method="get" className="card p-4 grid gap-4 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Desde</label>
          <input type="date" name="desde" defaultValue={desde.toISOString().slice(0, 10)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Hasta</label>
          <input type="date" name="hasta" defaultValue={hasta.toISOString().slice(0, 10)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Tipo</label>
          <select name="tipo" defaultValue={tipo ?? ""}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm">
            <option value="">Todos</option>
            {["CAMBIO_FECHA","REPACTACION","CAMBIO_MONTO","ANULACION","CONDONACION","EDICION_PAGO"].map(t => (
              <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button type="submit" className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">
            Filtrar
          </button>
        </div>
      </form>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <h3 className="font-semibold text-sm">Registro de cambios ({modificaciones.length})</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Fecha</th>
              <th className="table-cell text-left font-medium">Cliente / Contrato</th>
              <th className="table-cell text-left font-medium">Tipo cambio</th>
              <th className="table-cell text-left font-medium">Valor anterior</th>
              <th className="table-cell text-left font-medium">Valor nuevo</th>
              <th className="table-cell text-left font-medium">Usuario</th>
              <th className="table-cell text-left font-medium">Aprobado por</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {modificaciones.map(m => (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="table-cell text-xs text-[var(--muted)]">{new Date(m.created_at).toLocaleDateString("es-CL")}</td>
                <td className="table-cell">
                  <p className="font-medium">{m.contrato.cliente.nombre}</p>
                  <p className="text-xs text-[var(--muted)]">{m.contrato.tipo_servicio}</p>
                </td>
                <td className="table-cell">
                  <span className="rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-xs font-medium">
                    {m.tipo_modificacion.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="table-cell text-xs text-[var(--muted)]">
                  <code className="bg-slate-100 rounded px-1 py-0.5 text-xs">
                    {JSON.stringify(m.valor_anterior).slice(0, 60)}
                  </code>
                </td>
                <td className="table-cell text-xs">
                  <code className="bg-emerald-50 rounded px-1 py-0.5 text-xs text-emerald-700">
                    {JSON.stringify(m.valor_nuevo).slice(0, 60)}
                  </code>
                </td>
                <td className="table-cell text-[var(--muted)]">{m.usuario.nombre}</td>
                <td className="table-cell text-[var(--muted)]">{m.aprobador?.nombre ?? "—"}</td>
              </tr>
            ))}
            {modificaciones.length === 0 && (
              <tr><td colSpan={7} className="table-cell text-center text-[var(--muted)]">Sin cambios en el período</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
