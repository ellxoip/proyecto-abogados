import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { TipoGestion, ResultadoGestion } from "@prisma/client";
import { NuevaGestionModal } from "@/app/components/nueva-gestion-modal";

const tipoClass: Record<TipoGestion, string> = {
  LLAMADA: "bg-sky-100 text-sky-700",
  EMAIL: "bg-indigo-100 text-indigo-700",
  VISITA: "bg-purple-100 text-purple-700",
  CARTA: "bg-slate-100 text-slate-700",
  WHATSAPP: "bg-emerald-100 text-emerald-700",
};

const resultadoClass: Record<ResultadoGestion, string> = {
  EXITOSO: "bg-emerald-100 text-emerald-700",
  SIN_RESPUESTA: "bg-slate-100 text-slate-600",
  PROMESA_PAGO: "bg-amber-100 text-amber-700",
  RECHAZO: "bg-rose-100 text-rose-700",
  OTRO: "bg-slate-100 text-slate-600",
};

export default async function GestionesPage() {
  const hoy = new Date();

  const [gestiones, pendientesSeguimiento] = await Promise.all([
    prisma.gestionCobranza.findMany({
      include: {
        cliente: { select: { id: true, nombre: true, rut: true } },
        contrato: { select: { id: true, tipo_servicio: true } },
        usuario: { select: { nombre: true } },
      },
      orderBy: { fecha_gestion: "desc" },
      take: 200,
    }),
    prisma.gestionCobranza.count({
      where: { seguimiento_fecha: { lte: hoy } },
    }),
  ]);

  const stats = {
    total: gestiones.length,
    exitosas: gestiones.filter((g) => g.resultado === "EXITOSO").length,
    promesas: gestiones.filter((g) => g.resultado === "PROMESA_PAGO").length,
    sinRespuesta: gestiones.filter((g) => g.resultado === "SIN_RESPUESTA").length,
  };

  return (
    <section className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Gestiones de cobranza</h2>
          <p className="text-sm text-[var(--muted)]">Registro de contactos y seguimientos</p>
        </div>
        <NuevaGestionModal />
      </header>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Total gestiones</p>
          <p className="mt-1 text-xl font-bold">{stats.total}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Exitosas</p>
          <p className="mt-1 text-xl font-bold text-emerald-600">{stats.exitosas}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Promesas de pago</p>
          <p className="mt-1 text-xl font-bold text-amber-600">{stats.promesas}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Seguimientos pendientes</p>
          <p className={`mt-1 text-xl font-bold ${pendientesSeguimiento > 0 ? "text-rose-600" : ""}`}>
            {pendientesSeguimiento}
          </p>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--muted)]">
            <tr>
              <th className="table-cell font-medium">Fecha</th>
              <th className="table-cell font-medium">Cliente</th>
              <th className="table-cell font-medium">Contrato</th>
              <th className="table-cell font-medium">Tipo</th>
              <th className="table-cell font-medium">Resultado</th>
              <th className="table-cell font-medium">Seguimiento</th>
              <th className="table-cell font-medium">Notas</th>
              <th className="table-cell font-medium">Usuario</th>
            </tr>
          </thead>
          <tbody>
            {gestiones.map((g) => {
              const seguimientoVencido = g.seguimiento_fecha && new Date(g.seguimiento_fecha) <= hoy;
              return (
                <tr key={g.id} className="hover:bg-slate-50">
                  <td className="table-cell">{formatDate(g.fecha_gestion)}</td>
                  <td className="table-cell">
                    <Link href={`/clientes/${g.cliente.id}`} className="text-[var(--accent)] hover:underline font-medium">
                      {g.cliente.nombre}
                    </Link>
                    <p className="text-xs text-[var(--muted)]">{g.cliente.rut}</p>
                  </td>
                  <td className="table-cell">
                    <Link href={`/cuotas/${g.contrato.id}`} className="hover:underline text-xs">
                      #{g.contrato.id}
                    </Link>
                  </td>
                  <td className="table-cell">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tipoClass[g.tipo]}`}>
                      {g.tipo}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${resultadoClass[g.resultado]}`}>
                      {g.resultado.replace("_", " ")}
                    </span>
                  </td>
                  <td className="table-cell">
                    {g.seguimiento_fecha ? (
                      <span className={seguimientoVencido ? "text-rose-600 font-medium text-xs" : "text-xs"}>
                        {formatDate(g.seguimiento_fecha)}
                        {seguimientoVencido && " ⚠"}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="table-cell text-xs text-[var(--muted)] max-w-[160px] truncate">
                    {g.notas ?? "—"}
                  </td>
                  <td className="table-cell text-xs text-[var(--muted)]">{g.usuario.nombre}</td>
                </tr>
              );
            })}
            {gestiones.length === 0 && (
              <tr>
                <td colSpan={8} className="table-cell text-center text-[var(--muted)]">
                  Sin gestiones registradas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
