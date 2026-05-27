import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import { Role } from "@/lib/db-enums";
import { withRls } from "@/lib/rls";
import { KeyRound, User, Mail, Phone, Clock, CheckCircle2, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CredencialesTestPage() {
  const session = await auth();
  if (!session || session.user.role !== Role.SUPER_ADMIN) return notFound();

  const clients = await withRls((tx) =>
    tx.user.findMany({
      where: { role: Role.CLIENTE },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        createdAt: true,
        active: true,
        mustChangePassword: true,
        lastSeenAt: true,
        _count: { select: { casesAsClient: true } },
      },
      orderBy: { createdAt: "desc" },
    })
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-md bg-[var(--surface-2)]">
            <KeyRound className="w-5 h-5 text-[var(--gold)]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--text)]" style={{ fontFamily: "'Playfair Display', serif" }}>
              Credenciales de Clientes
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Solo visible para SuperAdmin · Estado de entrega de credenciales del portal
            </p>
          </div>
        </div>
        <div className="mt-4 px-4 py-3 rounded-md text-xs" style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.2)", color: "var(--gold)" }}>
          Las credenciales iniciales las genera hive-financial-control y las
          entrega nexio (WhatsApp + Email). El cliente las rota en el primer
          login. Acá solo verás el estado actual de cada cuenta.
        </div>
      </header>

      {clients.length === 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md p-12 text-center text-[var(--text-muted)] text-sm">
          No hay clientes registrados aún.
        </div>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-2)] border-b border-[var(--border-glass)]">
              <tr>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[var(--gold)]">Cliente</th>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[var(--gold)]">Email</th>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[var(--gold)]">Contraseña</th>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[var(--gold)]">Último acceso</th>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[var(--gold)]">Casos</th>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[var(--gold)]">Creado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-glass)]">
              {clients.map((c) => (
                <tr key={c.id} className="hover:bg-[var(--surface-2)] transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" />
                      <div>
                        <div className="font-semibold text-[var(--text)]">{c.fullName}</div>
                        <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] mt-0.5">
                          <Phone className="w-2.5 h-2.5" />
                          {c.phone}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      <Mail className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0" />
                      <span className="text-[var(--text-muted)] text-xs">{c.email}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <CredentialsStatus mustChange={c.mustChangePassword} active={c.active} />
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-[var(--text-muted)] text-xs">
                      {c.lastSeenAt ? new Date(c.lastSeenAt).toLocaleString("es-CL") : "Nunca"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className="text-[var(--text-muted)] text-xs font-bold">{c._count.casesAsClient}</span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                      <Clock className="w-3 h-3" />
                      {new Date(c.createdAt).toLocaleDateString("es-CL")}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CredentialsStatus({ mustChange, active }: { mustChange: boolean; active: boolean }) {
  if (mustChange) {
    return (
      <div className="inline-flex flex-col gap-0.5">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs w-fit" style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.2)", color: "var(--gold)" }}>
          <AlertCircle className="w-3 h-3" />
          Temporal (pendiente cambio)
        </div>
        {!active && (
          <span className="text-[10px] text-[var(--text-muted)]">Cuenta inactiva</span>
        )}
      </div>
    );
  }
  return (
    <div className="inline-flex flex-col gap-0.5">
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs w-fit" style={{ background: "rgba(34,139,84,0.08)", border: "1px solid rgba(34,139,84,0.25)", color: "#52b788" }}>
        <CheckCircle2 className="w-3 h-3" />
        Definida por cliente
      </div>
      {!active && (
        <span className="text-[10px] text-[var(--text-muted)]">Cuenta inactiva</span>
      )}
    </div>
  );
}
