import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function AdminAuditoriaPage({ searchParams }: { searchParams: { desde?: string; hasta?: string; sistema?: string; status?: string } }) {
  const hoy = new Date();
  const hace7 = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000);
  const desde = searchParams.desde ? new Date(searchParams.desde) : hace7;
  const hasta = searchParams.hasta ? new Date(searchParams.hasta + "T23:59:59") : new Date(hoy.toISOString().slice(0, 10) + "T23:59:59");

  const [eventos, sistemas] = await Promise.all([
    prisma.integrationEvent.findMany({
      where: {
        created_at: { gte: desde, lte: hasta },
        ...(searchParams.sistema ? { sistema_externo_id: Number(searchParams.sistema) } : {}),
        ...(searchParams.status ? { status: searchParams.status as never } : {}),
      },
      include: { sistema_externo: { select: { nombre: true, codigo: true } } },
      orderBy: { created_at: "desc" },
      take: 200,
    }),
    prisma.sistemaExterno.findMany({ select: { id: true, nombre: true } }),
  ]);

  const modificaciones = await prisma.modificacionContrato.findMany({
    where: { created_at: { gte: desde, lte: hasta } },
    include: {
      contrato: { include: { cliente: { select: { nombre: true } } } },
      usuario: { select: { nombre: true } },
    },
    orderBy: { created_at: "desc" },
    take: 50,
  });

  return (
    <section className="space-y-6">
      <header>
        <Link href="/administracion" className="text-xs text-[var(--muted)] hover:underline">← Administración</Link>
        <h2 className="mt-1 text-2xl font-semibold">Auditoría del sistema</h2>
        <p className="text-sm text-[var(--muted)]">Log de acciones e integraciones</p>
      </header>

      <form method="get" className="card p-4 flex gap-4 flex-wrap">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Desde</label>
          <input type="date" name="desde" defaultValue={desde.toISOString().slice(0, 10)}
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Hasta</label>
          <input type="date" name="hasta" defaultValue={hasta.toISOString().slice(0, 10)}
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Sistema</label>
          <select name="sistema" defaultValue={searchParams.sistema ?? ""}
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
            <option value="">Todos</option>
            {sistemas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Estado</label>
          <select name="status" defaultValue={searchParams.status ?? ""}
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
            <option value="">Todos</option>
            {["PENDING","PROCESSED","FAILED"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button type="submit" className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">Filtrar</button>
        </div>
      </form>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="font-semibold text-sm">Eventos de integración ({eventos.length})</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Fecha</th>
              <th className="table-cell text-left font-medium">Sistema</th>
              <th className="table-cell text-left font-medium">Evento</th>
              <th className="table-cell text-left font-medium">Estado</th>
              <th className="table-cell text-left font-medium">ID externo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {eventos.map(e => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="table-cell text-xs text-[var(--muted)]">{new Date(e.created_at).toLocaleString("es-CL")}</td>
                <td className="table-cell">{e.sistema_externo.nombre}</td>
                <td className="table-cell text-xs">{e.event_type}</td>
                <td className="table-cell">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${e.status === "PROCESSED" ? "bg-emerald-50 text-emerald-700" : e.status === "FAILED" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>
                    {e.status}
                  </span>
                </td>
                <td className="table-cell text-xs text-[var(--muted)]">{e.external_event_id ?? "—"}</td>
              </tr>
            ))}
            {eventos.length === 0 && <tr><td colSpan={5} className="table-cell text-center text-[var(--muted)]">Sin eventos</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="font-semibold text-sm">Modificaciones a contratos ({modificaciones.length})</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Fecha</th>
              <th className="table-cell text-left font-medium">Cliente</th>
              <th className="table-cell text-left font-medium">Tipo cambio</th>
              <th className="table-cell text-left font-medium">Motivo</th>
              <th className="table-cell text-left font-medium">Usuario</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {modificaciones.map(m => (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="table-cell text-xs text-[var(--muted)]">{new Date(m.created_at).toLocaleString("es-CL")}</td>
                <td className="table-cell">{m.contrato.cliente.nombre}</td>
                <td className="table-cell">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                    {m.tipo_modificacion.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="table-cell text-xs text-[var(--muted)]">{m.motivo}</td>
                <td className="table-cell text-[var(--muted)]">{m.usuario.nombre}</td>
              </tr>
            ))}
            {modificaciones.length === 0 && <tr><td colSpan={5} className="table-cell text-center text-[var(--muted)]">Sin modificaciones</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
