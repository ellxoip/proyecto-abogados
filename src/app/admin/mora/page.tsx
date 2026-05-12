import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { CaseStage, Role, PaymentStatus } from "@prisma/client";
import { Bell, CheckCircle2, TrendingDown, Clock, ShieldAlert, FileText } from "lucide-react";
import Link from "next/link";
import { remindClient, regularizeCase } from "./actions";

export default async function MoraDashboardPage({ searchParams }: { searchParams: { sort?: string } }) {
  const session = await auth();
  if (session?.user.role !== Role.SUPER_ADMIN) {
    return (
      <div className="p-16 text-center">
        <ShieldAlert className="w-12 h-12 text-red-600 mx-auto mb-4" />
        <h1 className="text-xl font-bold font-serif">Acceso Restringido</h1>
        <p className="text-sm text-slate-500 mt-2">Solo el SuperAdmin puede gestionar la morosidad global.</p>
      </div>
    );
  }

  const { cases, stats } = await withRls(async (tx) => {
    const cases = await tx.case.findMany({
      where: {
        OR: [
          { stage: CaseStage.HALTED_BY_PAYMENT },
          { stage: CaseStage.WAITING_CUOTAS },
          { is_paid: false }
        ]
      },
      include: {
        client: { select: { fullName: true, phone: true } },
        payments: { orderBy: { createdAt: "desc" }, take: 1 }
      },
      orderBy: searchParams.sort === "client_asc" ? { client: { fullName: "asc" } } : { updatedAt: "desc" }
    });

    const atRiskSum = await tx.paymentEvent.aggregate({
      _sum: { amount: true },
      where: {
        status: { in: [PaymentStatus.UNPAID, PaymentStatus.OVERDUE] },
        case: { stage: CaseStage.HALTED_BY_PAYMENT }
      }
    });

    return {
      cases,
      stats: {
        atRisk: atRiskSum._sum.amount?.toNumber() ?? 0,
        haltedCount: cases.filter(c => c.stage === CaseStage.HALTED_BY_PAYMENT).length,
        waitingCount: cases.filter(c => c.stage === CaseStage.WAITING_CUOTAS).length,
      }
    };
  });

  return (
    <div className="max-w-7xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--text)] font-serif">
          Gestión de Morosidad
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1 font-medium">
          Control centralizado de cuentas por cobrar y procesos legales suspendidos.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard 
          icon={TrendingDown} 
          label="Cartera Vencida (En Riesgo)" 
          value={`$${stats.atRisk.toLocaleString("es-CL")}`}
          sub="Basado en casos con flujo detenido"
          color="red"
        />
        <StatCard 
          icon={ShieldAlert} 
          label="Casos Paralizados" 
          value={stats.haltedCount.toString()}
          sub="Requieren regularización para continuar"
          color="orange"
        />
        <StatCard 
          icon={Clock} 
          label="Nuevos sin Pago Inicial" 
          value={stats.waitingCount.toString()}
          sub="Pendientes de validación inicial"
          color="amber"
        />
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-sm shadow-sm overflow-x-auto">
        <table className="w-full min-w-[820px] text-left border-collapse">
          <thead>
            <tr style={{ background: "var(--surface-2)" }}>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] border-b border-[var(--border-glass)]">Expediente</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] border-b border-[var(--border-glass)]">
                <Link 
                  href={`?sort=${searchParams.sort === "client_asc" ? "" : "client_asc"}`}
                  className="flex items-center gap-1 hover:text-[var(--text)] transition-colors"
                  title="Alternar orden alfabético"
                >
                  Cliente
                  {searchParams.sort === "client_asc" ? (
                    <span className="text-[var(--text)] font-extrabold">↑ A-Z</span>
                  ) : (
                    <span className="opacity-50 font-normal">⇵</span>
                  )}
                </Link>
              </th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] border-b border-[var(--border-glass)]">Motivo Suspensión</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] border-b border-[var(--border-glass)]">Acciones de Cobranza</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-glass)]">
            {cases.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-16 text-center text-sm text-[var(--text-muted)]">
                  No hay casos en mora actualmente. ¡Excelente gestión financiera!
                </td>
              </tr>
            ) : (
              cases.map((c) => (
                <tr key={c.id} className="hover:bg-[var(--surface)] transition-colors group">
                  <td className="px-6 py-5">
                    <Link href={`/admin/casos/${c.id}`} className="font-bold text-[var(--text)] tracking-wider hover:text-[var(--gold)] transition-colors">
                      {c.code}
                    </Link>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Halt: {c.halted_at ? new Date(c.halted_at).toLocaleDateString("es-CL") : "N/A"}</div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="text-sm font-medium text-[var(--text)]">{c.client.fullName}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">{c.client.phone}</div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2">
                       <div className={`w-2 h-2 rounded-full ${c.stage === CaseStage.HALTED_BY_PAYMENT ? "bg-red-500" : "bg-orange-400"}`} />
                       <span className="text-xs font-bold text-[var(--text)]">
                         {c.halted_reason || (c.stage === CaseStage.WAITING_CUOTAS ? "Pendiente Cuota Inicial" : "Pendiente de Validación")}
                       </span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center justify-end gap-2">
                       {c.payments[0]?.receipt_url && (
                         <a 
                           href={c.payments[0].receipt_url}
                           target="_blank"
                           rel="noopener noreferrer"
                           className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-widest bg-[rgba(59,130,246,0.1)] text-blue-400 border border-blue-500/20 hover:bg-blue-100 transition-all mr-2"
                           title="Ver comprobante de pago subido por el cliente"
                         >
                           <FileText className="w-3.5 h-3.5" />
                           Ver Comprobante
                         </a>
                       )}
                       <ActionButton 
                         icon={Bell} 
                         label="Recordar" 
                         action={async () => { "use server"; await remindClient(c.id); }} 
                         variant="outline"
                       />
                       <ActionButton 
                         icon={CheckCircle2} 
                         label="Regularizar" 
                         action={async () => { "use server"; await regularizeCase(c.id); }} 
                         variant="primary"
                       />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any, label: string, value: string, color: string, sub: string }) {
  const bg = color === "red" ? "bg-[rgba(239,68,68,0.1)]" : color === "orange" ? "bg-[rgba(249,115,22,0.1)]" : "bg-amber-50";
  const text = color === "red" ? "text-red-600" : color === "orange" ? "text-orange-600" : "text-amber-600";
  
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-sm p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2 rounded-sm ${bg}`}>
          <Icon className={`w-5 h-5 ${text}`} />
        </div>
      </div>
      <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">{label}</div>
      <div className="text-3xl font-bold text-[var(--text)]">{value}</div>
      <p className="text-[10px] text-[var(--text-muted)] mt-3 leading-relaxed">{sub}</p>
    </div>
  );
}

async function ActionButton({ icon: Icon, label, action, variant }: { icon: any, label: string, action: () => Promise<any>, variant: "primary" | "outline" }) {
  return (
    <form action={action}>
      <button
        type="submit"
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-widest transition-all ${
          variant === "primary" 
            ? "bg-[var(--bg)] text-[var(--gold)] hover:bg-[var(--border-subtle)]" 
            : "bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border-glass)] hover:border-[var(--gold)] hover:text-[var(--gold)]"
        }`}
      >
        <Icon className="w-3.5 h-3.5" />
        {label}
      </button>
    </form>
  );
}
