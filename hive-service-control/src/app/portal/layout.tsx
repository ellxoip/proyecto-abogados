import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { withRls } from "@/lib/rls";
import { ensurePagaCuotasPaymentLink } from "@/lib/pagacuotas";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "CLIENTE") redirect("/admin");

  const client = await withRls((tx) =>
    tx.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, rut: true, fullName: true, email: true, phone: true, paymentLink: true },
    }),
  );
  const paymentLink = client ? await ensurePagaCuotasPaymentLink(client) : null;

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
          {paymentLink && (
            <div className="relative group">
              <a
                href={paymentLink}
                target="_blank"
                rel="noreferrer"
                aria-label="Pagar cuotas pendientes"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-all hover:brightness-110"
                style={{
                  background: "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
                  border: "1px solid var(--gold-border)",
                  color: "#FFFFFF",
                }}
              >
                <CreditCard className="h-4 w-4" style={{ color: "var(--gold-soft)" }} />
                <span className="hidden sm:inline">Pagar</span>
              </a>
              <span
                role="tooltip"
                className="pointer-events-none absolute right-0 top-full mt-2 w-56 rounded-md px-3 py-2 text-[11px] leading-snug opacity-0 invisible group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-all z-20 shadow-lg"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--gold-border)",
                  color: "var(--text)",
                }}
              >
                Paga tus cuotas pendientes en PagaCuotas. Abre tu enlace seguro en una pestaña nueva.
              </span>
            </div>
          )}
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
