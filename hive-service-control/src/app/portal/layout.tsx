import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "CLIENTE") redirect("/admin");

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Dark premium header */}
      <header
        className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 sticky top-0 z-10"
        style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border-subtle)" }}
      >
        <Link href="/portal" className="flex items-center gap-3 min-w-0">
          <BrandMark size="sm" />
          <div className="hidden sm:block min-w-0">
            <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: "var(--text-muted)" }}>
              Portal de Seguimiento
            </div>
          </div>
        </Link>

        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          <div className="hidden md:block text-sm truncate max-w-[160px]" style={{ color: "var(--text-muted)" }}>
            {session.user.name}
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              className="text-[10px] sm:text-xs uppercase tracking-widest px-3 sm:px-4 py-2 rounded-sm transition-colors"
              style={{ color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}
            >
              Salir
            </button>
          </form>
        </div>
      </header>

      {/* Content */}
      <main className="p-4 sm:p-6 max-w-5xl mx-auto">{children}</main>
    </div>
  );
}

