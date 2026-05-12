import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { withSystemRls } from "@/lib/rls";
import { RegisterForm } from "./RegisterForm";

export default async function RegistroPage() {
  const session = await auth();
  if (session) redirect("/");

  const categories = await withSystemRls((tx) =>
    tx.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
  );

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--bg)] p-6 relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23C9A84C' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }} />

      <div className="relative w-full max-w-xl bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-lg p-10 space-y-6 shadow-2xl">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-serif tracking-wider">
            <span className="text-[var(--text)]">AT </span>
            <span className="text-[var(--gold)]">INFORMA</span>
          </h1>
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-[0.25em]">
            Solicitud de Asesoría Legal
          </p>
          <p className="text-sm text-[var(--text-muted)] pt-2">
            Crea tu cuenta y abre tu caso. Nuestro equipo te enviará la boleta inicial por WhatsApp y email.
          </p>
        </div>

        <RegisterForm categories={categories} />

        <div className="text-center pt-2 border-t border-[var(--border-subtle)]">
          <p className="text-xs text-[var(--text-muted)] pt-4">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="text-[var(--gold)] hover:text-[#D4B85C] transition-colors">
              Ingresa aquí
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
