import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function SeguridadPage() {
  const totalUsuarios = await prisma.usuario.count();
  const activos = await prisma.usuario.count({ where: { activo: true } });

  return (
    <section className="space-y-6">
      <header>
        <Link href="/administracion" className="text-xs text-[var(--muted)] hover:underline">← Administración</Link>
        <h2 className="mt-1 text-2xl font-semibold">Seguridad</h2>
        <p className="text-sm text-[var(--muted)]">Políticas de acceso y autenticación</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Total usuarios</p>
          <p className="mt-1 text-2xl font-bold">{totalUsuarios}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Usuarios activos</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{activos}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Usuarios inactivos</p>
          <p className="mt-1 text-2xl font-bold text-slate-500">{totalUsuarios - activos}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold">Política de contraseñas</h3>
          <ul className="space-y-2 text-sm text-[var(--muted)]">
            <li className="flex items-center gap-2">
              <span className="text-emerald-500">✓</span> Mínimo 8 caracteres
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-500">✓</span> Hash bcrypt (10 rondas)
            </li>
            <li className="flex items-center gap-2">
              <span className="text-amber-500">○</span> Expiración de contraseña — no configurado
            </li>
            <li className="flex items-center gap-2">
              <span className="text-amber-500">○</span> Complejidad requerida — no configurado
            </li>
          </ul>
        </div>

        <div className="card p-5 space-y-4">
          <h3 className="font-semibold">Autenticación</h3>
          <ul className="space-y-2 text-sm text-[var(--muted)]">
            <li className="flex items-center gap-2">
              <span className="text-emerald-500">✓</span> Sesión basada en cookie HTTP
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-500">✓</span> Login con email + contraseña
            </li>
            <li className="flex items-center gap-2">
              <span className="text-amber-500">○</span> 2FA — no implementado
            </li>
            <li className="flex items-center gap-2">
              <span className="text-amber-500">○</span> IP allowlist — no implementado
            </li>
          </ul>
        </div>

        <div className="card p-5 space-y-3">
          <h3 className="font-semibold">Sesiones activas</h3>
          <p className="text-sm text-[var(--muted)]">
            El sistema usa cookies de sesión sin persistencia en base de datos. Para revocar acceso de un usuario, desactívelo desde <Link href="/administracion/usuarios" className="text-[var(--accent)] hover:underline">Usuarios</Link>.
          </p>
        </div>

        <div className="card p-5 space-y-3">
          <h3 className="font-semibold">Acciones recomendadas</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">!</span>
              <span>Revisar usuarios inactivos y eliminarlos si ya no corresponde</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">!</span>
              <span>Verificar que solo usuarios ADMIN tengan acceso a Administración</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-0.5">i</span>
              <span>Cambiar contraseñas periódicamente desde <Link href="/configuracion/usuarios" className="text-[var(--accent)] hover:underline">Configuración → Usuarios</Link></span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
