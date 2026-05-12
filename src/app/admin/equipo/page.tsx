import { auth } from "@/lib/auth";
import { EquipoConfig } from "./EquipoConfig";
import { Shield, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { withRls } from "@/lib/rls";

export const dynamic = "force-dynamic";

export default async function EquipoPage() {
  const session = await auth();
  if (!session) return notFound();
  
  const role = session.user.role;
  if (role !== Role.SUPER_ADMIN && role !== Role.JEFE_DE_MESA) {
    return notFound();
  }

  // Fetch Jefes de Mesa for the abogado assignment dropdown
  const jefes = await withRls(async (tx) => {
    return tx.user.findMany({
      where: { role: Role.JEFE_DE_MESA, active: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    });
  });

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-10">
        <div className="flex items-center gap-3 mb-2">
           <Shield className="w-5 h-5 text-[var(--gold)]" />
           <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--text-muted)]">Panel de Control Maestro</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--text)] font-serif">
          Gestión de Equipo y Configuración
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1 font-medium max-w-2xl">
          Administre las categorías legales del sistema y gestione las credenciales de acceso para el personal jurídico.
        </p>
      </header>

      <EquipoConfig role={role} jefes={jefes} />

      <footer className="mt-16 pt-8 border-t border-[var(--border-glass)] flex items-center justify-between opacity-50">
        <div className="flex items-center gap-2">
           <Users className="w-4 h-4" />
           <span className="text-[10px] font-bold uppercase tracking-widest">AT INFORMA Legal OS v3.0</span>
        </div>
        <div className="text-[10px] font-medium italic">Acceso restringido — Nivel de Autorización: {role}</div>
      </footer>
    </div>
  );
}
