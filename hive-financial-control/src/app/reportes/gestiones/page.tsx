import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function ReporteGestionesPage({ searchParams }: { searchParams: { desde?: string; hasta?: string; tipo?: string; usuario_id?: string } }) {
  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

  const desde = searchParams.desde ? new Date(searchParams.desde) : inicioMes;
  const hasta = searchParams.hasta ? new Date(searchParams.hasta) : hoy;
  const tipo = searchParams.tipo;
  const usuarioId = searchParams.usuario_id ? Number(searchParams.usuario_id) : undefined;

  const gestiones = await prisma.gestionCobranza.findMany({
    where: {
      fecha_gestion: { gte: desde, lte: hasta },
      ...(tipo ? { tipo: tipo as never } : {}),
      ...(usuarioId ? { usuario_id: usuarioId } : {}),
    },
    include: {
      cliente: { select: { nombre: true, rut: true } },
      contrato: { select: { tipo_servicio: true } },
      usuario: { select: { nombre: true } },
    },
    orderBy: { fecha_gestion: "desc" },
  });

  const usuarios = await prisma.usuario.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: "asc" } });

  const resumen = {
    total: gestiones.length,
    exitosas: gestiones.filter(g => g.resultado === "EXITOSO").length,
    sinRespuesta: gestiones.filter(g => g.resultado === "SIN_RESPUESTA").length,
    promesa: gestiones.filter(g => g.resultado === "PROMESA_PAGO").length,
    porTipo: Object.entries(
      gestiones.reduce((acc, g) => { acc[g.tipo] = (acc[g.tipo] || 0) + 1; return acc; }, {} as Record<string, number>)
    ).sort((a, b) => b[1] - a[1]),
  };

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/reportes" className="text-xs text-[var(--muted)] hover:underline">← Reportes</Link>
          <h2 className="mt-1 text-2xl font-semibold">Gestiones realizadas</h2>
          <p className="text-sm text-[var(--muted)]">Cantidad y tipo de gestión por usuario y período</p>
        </div>
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
            {["LLAMADA","EMAIL","VISITA","CARTA","WHATSAPP"].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Usuario</label>
          <select name="usuario_id" defaultValue={usuarioId ?? ""}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm">
            <option value="">Todos</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </div>
        <div className="sm:col-span-4">
          <button type="submit" className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">
            Aplicar filtros
          </button>
        </div>
      </form>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Total gestiones</p>
          <p className="mt-1 text-2xl font-bold">{resumen.total}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Exitosas</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{resumen.exitosas}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Promesa de pago</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{resumen.promesa}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Sin respuesta</p>
          <p className="mt-1 text-2xl font-bold text-slate-500">{resumen.sinRespuesta}</p>
        </div>
      </div>

      {resumen.porTipo.length > 0 && (
        <div className="card p-4">
          <h3 className="font-semibold text-sm mb-3">Por tipo de gestión</h3>
          <div className="flex flex-wrap gap-4">
            {resumen.porTipo.map(([tipo, cnt]) => (
              <div key={tipo} className="text-center">
                <p className="text-lg font-bold">{cnt}</p>
                <p className="text-xs text-[var(--muted)]">{tipo}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="font-semibold text-sm">Detalle de gestiones</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Fecha</th>
              <th className="table-cell text-left font-medium">Cliente</th>
              <th className="table-cell text-left font-medium">Tipo</th>
              <th className="table-cell text-left font-medium">Resultado</th>
              <th className="table-cell text-left font-medium">Usuario</th>
              <th className="table-cell text-left font-medium">Seguimiento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {gestiones.map(g => (
              <tr key={g.id} className="hover:bg-slate-50">
                <td className="table-cell">{new Date(g.fecha_gestion).toLocaleDateString("es-CL")}</td>
                <td className="table-cell">
                  <span className="font-medium">{g.cliente.nombre}</span>
                  <p className="text-xs text-[var(--muted)]">{g.cliente.rut}</p>
                </td>
                <td className="table-cell">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{g.tipo}</span>
                </td>
                <td className="table-cell">
                  <span className={`text-xs font-medium ${g.resultado === "EXITOSO" ? "text-emerald-600" : g.resultado === "PROMESA_PAGO" ? "text-amber-600" : "text-slate-500"}`}>
                    {g.resultado.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="table-cell text-[var(--muted)]">{g.usuario.nombre}</td>
                <td className="table-cell text-[var(--muted)]">
                  {g.seguimiento_fecha ? new Date(g.seguimiento_fecha).toLocaleDateString("es-CL") : "—"}
                </td>
              </tr>
            ))}
            {gestiones.length === 0 && (
              <tr><td colSpan={6} className="table-cell text-center text-[var(--muted)]">Sin gestiones en el período</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
