import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AdministracionPage() {
  const [usuarios, empresas] = await Promise.all([
    prisma.usuario.count(),
    prisma.empresa.count(),
  ]);

  const links = [
    { href: "/administracion/empresas", label: "Empresas", desc: "Gestión multi-empresa", count: empresas },
    { href: "/administracion/usuarios", label: "Usuarios globales", desc: "Acceso y roles", count: usuarios },
    { href: "/administracion/seguridad", label: "Seguridad", desc: "Políticas de acceso" },
    { href: "/administracion/auditoria", label: "Auditoría", desc: "Log de acciones del sistema" },
  ];

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">Administración</h2>
        <p className="text-sm text-[var(--muted)]">Panel de control del sistema</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {links.map(l => (
          <Link key={l.href} href={l.href} className="card p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">{l.label}</p>
                <p className="text-sm text-[var(--muted)] mt-0.5">{l.desc}</p>
              </div>
              {l.count !== undefined && (
                <span className="text-2xl font-bold text-[var(--accent)]">{l.count}</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
