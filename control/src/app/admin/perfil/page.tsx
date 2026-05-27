import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { notFound } from "next/navigation";
import { ProfileForm } from "./ProfileForm";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) return notFound();

  const user = await withRls(async (tx) => {
    return tx.user.findUnique({
      where: { id: session.user.id },
    });
  });

  if (!user) return notFound();

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold" style={{ color: "var(--text)" }}>Mi Perfil</h1>
        <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
          Gestiona tu información personal y configuración de seguridad
        </p>
      </div>

      <div 
        className="rounded-xl overflow-hidden shadow-2xl"
        style={{ 
          background: "var(--surface)", 
          border: "1px solid var(--border-glass)" 
        }}
      >
        <ProfileForm 
          initialData={{
            fullName: user.fullName,
            email: user.email,
            role: user.role
          }} 
        />
      </div>
    </div>
  );
}
