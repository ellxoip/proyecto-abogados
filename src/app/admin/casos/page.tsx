import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { Role } from "@/lib/db-enums";
import { Eye, Activity, Clock, ShieldCheck, AlertTriangle, FolderOpen } from "lucide-react";
import Link from "next/link";
import { stageLabel, stageDescription } from "@/lib/labels";
import { HelpTip } from "@/components/HelpTip";
import { EmptyState } from "@/components/EmptyState";

const STAGE_BADGE_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  OPEN: { bg: "rgba(34, 197, 94, 0.10)", color: "#15803D", border: "rgba(34, 197, 94, 0.32)" },
  IN_PROGRESS: { bg: "rgba(37, 99, 235, 0.10)", color: "#1D4ED8", border: "rgba(37, 99, 235, 0.32)" },
  FINISHED: { bg: "rgba(148, 163, 184, 0.18)", color: "#475569", border: "rgba(148, 163, 184, 0.40)" },
  HALTED_BY_PAYMENT: { bg: "rgba(220, 38, 38, 0.10)", color: "#B91C1C", border: "rgba(220, 38, 38, 0.32)" },
  WAITING_CUOTAS: { bg: "rgba(217, 119, 6, 0.10)", color: "#B45309", border: "rgba(217, 119, 6, 0.32)" },
};

export default async function CasosPage({ searchParams }: { searchParams: { sort?: string } }) {
  const session = await auth();
  const role = session!.user.role;
  const userId = session!.user.id;
  const isJefe = role === Role.JEFE_DE_MESA;

  const where =
    role === Role.SUPER_ADMIN
      ? {}
      : role === Role.JEFE_DE_MESA
      ? {
          OR: [
            { jefe_mesa_id: userId },
            { abogados: { some: { managedById: userId } } },
          ],
        }
      : role === Role.ABOGADO
      ? { abogados: { some: { id: userId } } }
      : { id: "__none__" };



  const cases = await withRls((tx) =>
    tx.case.findMany({
      where,
      include: {
        client: { select: { fullName: true } },
        abogados: { select: { fullName: true } },
        jefeMesa: { select: { fullName: true } },
      },

      orderBy: searchParams.sort === "client_asc" ? { client: { fullName: "asc" } } : { updatedAt: "desc" },
      take: searchParams.sort === "client_asc" ? undefined : 100,
    }),
  );

  return (
    <div className="max-w-7xl mx-auto">
      <header className="mb-8">
         <div className="flex items-center gap-2">
           <h1 className="text-3xl font-bold tracking-tight text-[var(--text)] font-serif">
              Gestión de Casos
           </h1>
           <HelpTip
             content="Listado completo de expedientes bajo tu responsabilidad. Las filas en rojo indican casos en mora; los que acumulan 3 o más cuotas vencidas quedan bloqueados para asignación."
             side="bottom"
             size="md"
             asInfo
           />
         </div>
         <p className="text-sm text-[var(--text-muted)] mt-1 font-medium">
            Listado completo de expedientes bajo su responsabilidad profesional.
         </p>
      </header>

      <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-sm shadow-sm overflow-x-auto">
        <table className="w-full min-w-[820px] text-left border-collapse">
          <thead>
            <tr style={{ background: "var(--surface-2)" }}>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] border-b border-[var(--border-glass)]">Código</th>
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
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] border-b border-[var(--border-glass)]">
                <span className="inline-flex items-center gap-1.5">
                  Estado
                  <HelpTip content="Etapa actual en el ciclo del caso: Abierto (esperando asignación), En Proceso (con abogado), Detenido por Mora, Esperando Pago Inicial o Finalizado." />
                </span>
              </th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] border-b border-[var(--border-glass)]">
                <span className="inline-flex items-center gap-1.5">
                  Salud Sistema
                  <HelpTip content="Indicador del worker automático que revisa cada caso cada 15 minutos. Óptimo = chequeo reciente. Revisión = pendiente del próximo barrido." />
                </span>
              </th>
              {!isJefe && (
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] border-b border-[var(--border-glass)]">
                  <span className="inline-flex items-center gap-1.5">
                    Finanzas
                    <HelpTip content="Estado financiero del caso. 'Mora' indica cuotas vencidas. Casos con 3+ cuotas vencidas quedan bloqueados para asignación." />
                  </span>
                </th>
              )}
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] border-b border-[var(--border-glass)]">Responsable</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] border-b border-[var(--border-glass)] text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-glass)]">
            {cases.length === 0 ? (
              <tr>
                <td colSpan={isJefe ? 6 : 7} className="p-0">
                  <EmptyState
                    icon={FolderOpen}
                    title="No tienes expedientes asignados"
                    description={
                      isJefe
                        ? "Aún no hay casos bajo tu supervisión. Cuando el SuperAdmin te derive un caso, aparecerá aquí para que asignes el equipo legal."
                        : "Aún no hay casos registrados en tu mesa de trabajo. Los expedientes que te asignen aparecerán en esta vista."
                    }
                    size="lg"
                  />
                </td>
              </tr>
            ) : (
              cases.map((c) => {
                const isMoroso = !c.is_paid || (c.unpaid_months ?? 0) > 0 || c.stage === "HALTED_BY_PAYMENT";
                const isHardLocked = (c.unpaid_months ?? 0) >= 3 || c.stage === "HALTED_BY_PAYMENT";
                const stageStyle = STAGE_BADGE_STYLE[c.stage] ?? STAGE_BADGE_STYLE.OPEN;

                return (
                  <tr
                    key={c.id}
                    className="transition-colors group"
                    style={
                      isMoroso
                        ? {
                            background: isHardLocked ? "rgba(220, 38, 38, 0.07)" : "rgba(220, 38, 38, 0.035)",
                            borderLeft: `3px solid ${isHardLocked ? "var(--red)" : "rgba(220, 38, 38, 0.50)"}`,
                          }
                        : undefined
                    }
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text)] tracking-wider">{c.code}</span>
                        {isHardLocked && (
                          <span title="Caso bloqueado: 3+ cuotas vencidas">
                            <AlertTriangle className="w-3.5 h-3.5 text-[var(--red)]" />
                          </span>
                        )}
                      </div>
                      <div className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-tighter mt-0.5 flex items-center gap-1">
                         <Clock className="w-2.5 h-2.5" />
                         Act: {new Date(c.updatedAt).toLocaleDateString("es-CL")}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-[var(--text)]">{c.client.fullName}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        title={stageDescription(c.stage)}
                        className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm border"
                        style={{ background: stageStyle.bg, color: stageStyle.color, borderColor: stageStyle.border }}
                      >
                        {stageLabel(c.stage)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {c.last_health_check_at && (new Date().getTime() - new Date(c.last_health_check_at).getTime() < 60 * 60 * 1000) ? (
                        <div className="flex items-center gap-1.5 text-green-700">
                          <ShieldCheck className="w-4 h-4" />
                          <span className="text-[10px] font-bold uppercase tracking-widest">Óptimo</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-amber-700">
                          <Activity className="w-4 h-4" />
                          <span className="text-[10px] font-bold uppercase tracking-widest">Revisión</span>
                        </div>
                      )}
                    </td>
                    {!isJefe && (
                      <td className="px-6 py-4">
                        {isHardLocked ? (
                          <span
                            title="Bloqueado: 3 o más cuotas vencidas"
                            className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm border"
                            style={{ background: "var(--red-dim)", color: "var(--red)", borderColor: "var(--red-border)" }}
                          >
                            Mora 3+ · Bloqueado
                          </span>
                        ) : isMoroso ? (
                          <span
                            title={`Cuotas vencidas: ${c.unpaid_months ?? 0}`}
                            className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm border"
                            style={{ background: "var(--red-dim)", color: "var(--red)", borderColor: "var(--red-border)" }}
                          >
                            Mora {c.unpaid_months ? `· ${c.unpaid_months} mes${c.unpaid_months > 1 ? "es" : ""}` : ""}
                          </span>
                        ) : (
                          <span
                            className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm border"
                            style={{ background: "var(--green-dim)", color: "var(--green)", borderColor: "var(--green-border)" }}
                          >
                            Al día
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-6 py-4 text-xs font-medium text-[var(--text-muted)]">
                      {c.abogados[0]?.fullName ?? "No asignado"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/admin/casos/${c.id}`}
                        className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] hover:text-[var(--text)] transition-colors"
                      >
                        Ver Expediente
                        <Eye className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
