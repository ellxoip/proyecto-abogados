import Link from "next/link";
import { prisma } from "@/lib/prisma";

const MODULOS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "clientes", label: "Clientes" },
  { key: "contratos", label: "Contratos" },
  { key: "cobranza", label: "Cobranza" },
  { key: "tesoreria", label: "Tesorería" },
  { key: "ventas", label: "Ventas" },
  { key: "compras", label: "Compras" },
  { key: "contabilidad", label: "Contabilidad" },
  { key: "reportes", label: "Reportes" },
  { key: "bi", label: "BI y análisis" },
  { key: "configuracion", label: "Configuración" },
  { key: "administracion", label: "Administración" },
];

const ROL_PERMISOS: Record<string, string[]> = {
  ADMIN: MODULOS.map(m => m.key),
  CONTADOR: ["dashboard","clientes","contratos","cobranza","tesoreria","ventas","compras","contabilidad","reportes","bi"],
  ANALISTA: ["dashboard","clientes","contratos","cobranza","reportes","bi"],
  SOLO_LECTURA: ["dashboard","clientes","contratos","reportes"],
};

export default async function PermisosPage() {
  const usuarios = await prisma.usuario.findMany({
    select: { id: true, nombre: true, email: true, rol: true, activo: true },
    orderBy: { nombre: "asc" },
  });

  return (
    <section className="space-y-6">
      <header>
        <Link href="/configuracion" className="text-xs text-[var(--muted)] hover:underline">← Configuración</Link>
        <h2 className="mt-1 text-2xl font-semibold">Permisos</h2>
        <p className="text-sm text-[var(--muted)]">Control de acceso por módulo y rol de usuario</p>
      </header>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="font-semibold text-sm">Permisos por rol</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-[var(--muted)]">
              <tr>
                <th className="table-cell text-left font-medium">Módulo</th>
                {Object.keys(ROL_PERMISOS).map(rol => (
                  <th key={rol} className="table-cell text-center font-medium">{rol}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {MODULOS.map(m => (
                <tr key={m.key} className="hover:bg-slate-50">
                  <td className="table-cell font-medium">{m.label}</td>
                  {Object.entries(ROL_PERMISOS).map(([rol, perms]) => (
                    <td key={rol} className="table-cell text-center">
                      {perms.includes(m.key)
                        ? <span className="text-emerald-600">✓</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="font-semibold text-sm">Usuarios y sus roles actuales</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Usuario</th>
              <th className="table-cell text-left font-medium">Email</th>
              <th className="table-cell text-left font-medium">Rol</th>
              <th className="table-cell text-left font-medium">Estado</th>
              <th className="table-cell text-left font-medium">Módulos permitidos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {usuarios.map(u => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="table-cell font-medium">{u.nombre}</td>
                <td className="table-cell text-[var(--muted)]">{u.email}</td>
                <td className="table-cell">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{u.rol}</span>
                </td>
                <td className="table-cell">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {u.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="table-cell text-xs text-[var(--muted)]">
                  {(ROL_PERMISOS[u.rol] ?? []).length} módulos
                </td>
              </tr>
            ))}
            {usuarios.length === 0 && <tr><td colSpan={5} className="table-cell text-center text-[var(--muted)]">Sin usuarios</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card p-4 bg-blue-50">
        <p className="text-sm text-blue-700">Los permisos se asignan por rol. Para cambiar los permisos de un usuario, edite su rol en <Link href="/configuracion/usuarios" className="underline">Configuración → Usuarios</Link>.</p>
      </div>
    </section>
  );
}
