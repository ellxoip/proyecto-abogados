import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import { ModernHeader } from "@/components/ModernHeader";
import { updatePresence } from "@/lib/update-presence";
import { ActiveTimerWidget } from "@/components/productividad/ActiveTimerWidget";
import { MessengerDock } from "@/components/messenger/MessengerDock";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "SuperAdmin",
  JEFE_DE_MESA: "Jefe de Grupo",
  ABOGADO: "Abogado",
  CLIENTE: "Cliente",
  SISTEMA_CUOTAS: "Sistema de Cuotas",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role === "CLIENTE") redirect("/portal");

  await updatePresence();

  const userRole = ROLE_LABELS[session.user.role] ?? session.user.role;
  const isSuperAdmin = session.user.role === "SUPER_ADMIN";

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen lg:ml-64">
        <ModernHeader userName={session.user.name ?? "Usuario"} userRole={userRole} isSuperAdmin={isSuperAdmin} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
      {/* Persistent timer widget — appears whenever the lawyer has an open session */}
      <ActiveTimerWidget />
      {/* Dock global de mensajería — overlay flotante, no destruye la página activa */}
      <MessengerDock />
    </div>
  );
}
