import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function IntegracionesPage() {
  const sistemas = await prisma.sistemaExterno.findMany({ orderBy: { nombre: "asc" } });

  const INTEGRACIONES = [
    {
      codigo: "PAGACUOTAS",
      nombre: "PagaCuotas",
      descripcion: "Portal de pago online para clientes. Permite cobros por transferencia y tarjeta.",
      estado: sistemas.find(s => s.codigo === "PAGACUOTAS")?.activo ? "activo" : "pendiente",
      icon: "💳",
    },
    {
      codigo: "CRM",
      nombre: "CRM",
      descripcion: "Sincronización de oportunidades ganadas como contratos. Recibe webhooks de cierre.",
      estado: sistemas.find(s => s.codigo === "CRM")?.activo ? "activo" : "pendiente",
      icon: "🤝",
    },
    {
      codigo: "AT_INFORMA",
      nombre: "AT-Informa",
      descripcion: "Consulta de deudores en sistema de información comercial.",
      estado: sistemas.find(s => s.codigo === "AT_INFORMA")?.activo ? "activo" : "pendiente",
      icon: "🔍",
    },
    {
      codigo: "SII",
      nombre: "SII — Servicio de Impuestos Internos",
      descripcion: "Integración tributaria para emisión y recepción de DTE. Requiere certificado digital.",
      estado: "no-implementado",
      icon: "📋",
    },
    {
      codigo: "BANCOS",
      nombre: "Conexión bancaria",
      descripcion: "Descarga automática de cartolas desde API bancaria. Requiere convenio con el banco.",
      estado: "no-implementado",
      icon: "🏦",
    },
  ];

  return (
    <section className="space-y-6">
      <header>
        <Link href="/configuracion" className="text-xs text-[var(--muted)] hover:underline">← Configuración</Link>
        <h2 className="mt-1 text-2xl font-semibold">Integraciones</h2>
        <p className="text-sm text-[var(--muted)]">Conexiones con sistemas externos</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {INTEGRACIONES.map(int => (
          <div key={int.codigo} className="card p-5">
            <div className="flex items-start gap-3">
              <span className="text-2xl">{int.icon}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold">{int.nombre}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    int.estado === "activo" ? "bg-emerald-50 text-emerald-700" :
                    int.estado === "pendiente" ? "bg-amber-50 text-amber-700" :
                    "bg-slate-100 text-slate-500"
                  }`}>
                    {int.estado === "activo" ? "Activo" : int.estado === "pendiente" ? "Configurar" : "No implementado"}
                  </span>
                </div>
                <p className="text-sm text-[var(--muted)]">{int.descripcion}</p>
                {int.estado === "activo" && (
                  <div className="mt-3">
                    {sistemas.filter(s => s.codigo === int.codigo).map(s => (
                      <div key={s.id} className="text-xs text-[var(--muted)]">
                        <p>URL: {s.base_url ?? "No configurada"}</p>
                      </div>
                    ))}
                  </div>
                )}
                {int.estado === "no-implementado" && (
                  <p className="text-xs text-amber-600 mt-2">Disponible en próximas versiones</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-4 bg-slate-50">
        <h3 className="font-semibold text-sm mb-2">Logs de sincronización</h3>
        <SyncLogs />
      </div>
    </section>
  );
}

async function SyncLogs() {
  const logs = await prisma.externalSyncLog.findMany({
    include: { sistema_externo: { select: { nombre: true } } },
    orderBy: { started_at: "desc" },
    take: 10,
  });

  if (logs.length === 0) return <p className="text-sm text-[var(--muted)]">Sin logs de sincronización.</p>;

  return (
    <table className="w-full text-xs">
      <thead className="text-[var(--muted)]">
        <tr>
          <th className="text-left py-1">Sistema</th>
          <th className="text-left py-1">Tipo</th>
          <th className="text-left py-1">Estado</th>
          <th className="text-left py-1">Inicio</th>
        </tr>
      </thead>
      <tbody>
        {logs.map(l => (
          <tr key={l.id}>
            <td className="py-0.5">{l.sistema_externo.nombre}</td>
            <td className="py-0.5 text-[var(--muted)]">{l.sync_type}</td>
            <td className="py-0.5">
              <span className={`px-1 rounded ${l.status === "SUCCESS" ? "text-emerald-600" : l.status === "FAILED" ? "text-rose-600" : "text-amber-600"}`}>
                {l.status}
              </span>
            </td>
            <td className="py-0.5 text-[var(--muted)]">{new Date(l.started_at).toLocaleString("es-CL")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
