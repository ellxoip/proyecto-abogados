import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { CaseStage, Role } from "@/lib/db-enums";
import { CategoryBadge } from "@/components/CategoryBadge";
import { RealtimeCaseSync } from "@/components/RealtimeCaseSync";
import { HaltedOverlay } from "@/components/HaltedOverlay";
import { StageTimeline } from "@/components/StageTimeline";
import { FinishCaseButton } from "@/components/FinishCaseButton";
import { TimerLauncher } from "@/components/productividad/TimerLauncher";
import { TimerOnboardingPrompt } from "@/components/productividad/TimerOnboardingPrompt";
import { generateSupabaseToken } from "@/lib/supabase-jwt";
import { isOnline } from "@/lib/update-presence";
import { formatHmsFromMinutes } from "@/lib/format-duration";
import { UpdateForm } from "./UpdateForm";
import { TimeEntryButton } from "./TimeEntryButton";
import { CaseProgressChecklist } from "./CaseProgressChecklist";
import { AlertTriangle, Briefcase, Clock, Download, FileText, Scale, Shield, User } from "lucide-react";

function isResolutionUpdate(update: { description: string; document_url: string | null }) {
  const normalized = update.description
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return Boolean(update.document_url?.trim()) && normalized.includes("resolucion final");
}

export default async function AdminCaseDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return notFound();

  const caseScope =
    session.user.role === Role.SUPER_ADMIN
      ? {}
      : session.user.role === Role.JEFE_DE_MESA
      ? {
          OR: [
            { jefe_mesa_id: session.user.id },
            { abogados: { some: { managedById: session.user.id } } },
          ],
        }
      : session.user.role === Role.ABOGADO
      ? { abogados: { some: { id: session.user.id } } }
      : { id: "__none__" };

  const { kase, auditLogs, totalMinutes } = await withRls(async (tx) => {
    const kase = await tx.case.findFirst({
      where: { id: params.id, ...caseScope },
      include: {
        client: { select: { fullName: true, email: true, phone: true, lastSeenAt: true } },
        abogados: { select: { id: true, fullName: true, lastSeenAt: true } },
        jefeMesa: { select: { id: true, fullName: true, lastSeenAt: true } },
        categoria: { include: { slaDefinition: true } },
        updates: { orderBy: { createdAt: "desc" } },
        comments: {
          include: { author: { select: { fullName: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    const auditLogs = kase
      ? await tx.auditLog.findMany({
          where: { caseId: kase.id },
          orderBy: { createdAt: "desc" },
          take: 10,
        })
      : [];
    const totalMinutesResult = kase
      ? await tx.timeEntry.aggregate({ where: { caseId: kase.id }, _sum: { durationMinutes: true } })
      : null;
    return { kase, auditLogs, totalMinutes: totalMinutesResult?._sum.durationMinutes ?? 0 };
  });

  if (!kase) return notFound();

  const isFinished = kase.stage === CaseStage.FINISHED;
  const isInProgress = kase.stage === CaseStage.IN_PROGRESS;
  const isHalted = kase.stage === CaseStage.HALTED_BY_PAYMENT;
  const isWaiting = kase.stage === CaseStage.WAITING_CUOTAS;
  const blockedFromActions = isHalted || isWaiting || isFinished;
  const hasUpdates = kase.updates.length > 0;
  const hasResolutionDocument = kase.updates.some(isResolutionUpdate);
  const realtimeToken = generateSupabaseToken(session.user.id, session.user.role);

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      <RealtimeCaseSync caseId={kase.id} realtimeToken={realtimeToken} />

      <header className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-md bg-[var(--surface-2)]">
              <Scale className="w-6 h-6 text-[var(--gold)]" />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1
                  className="text-2xl font-bold tracking-tight text-[var(--text)]"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  Expediente {kase.code}
                </h1>
                <CategoryBadge category={kase.categoria} />
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-1 flex items-center gap-2">
                <Clock className="w-3 h-3" />
                Ultima actualizacion: {kase.updatedAt.toLocaleString("es-CL")}
                <span className="ml-2 font-bold font-mono tabular-nums" style={{ color: "var(--gold)" }}>
                  {formatHmsFromMinutes(totalMinutes)} registradas
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {isInProgress && session.user.role !== Role.CLIENTE && (
              <TimerLauncher caseId={kase.id} caseCode={kase.code} />
            )}
            {isInProgress && session.user.role === Role.ABOGADO && (
              <TimerOnboardingPrompt caseId={kase.id} caseCode={kase.code} />
            )}
            {isInProgress && session.user.role !== Role.CLIENTE && (
              <TimeEntryButton caseId={kase.id} caseCode={kase.code} caseStage={kase.stage} />
            )}
            {isInProgress && session.user.role !== Role.CLIENTE && (
              <FinishCaseButton caseId={kase.id} caseCode={kase.code} />
            )}
          </div>
        </div>

        <div className="mt-5">
          <StageTimeline stage={kase.stage} />
        </div>
      </header>

      {isHalted && (
        <div
          className="flex items-start gap-3 p-4 rounded-md border"
          style={{ background: "rgba(220, 38, 38, 0.1)", borderColor: "rgba(220, 38, 38, 0.3)" }}
        >
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "var(--red)" }} />
          <div>
            <div className="text-sm font-bold" style={{ color: "var(--red)" }}>Proceso detenido por mora</div>
            <p className="text-xs mt-1" style={{ color: "var(--red)" }}>
              {kase.halted_reason ?? "Cliente en mora"}.
              {kase.halted_at && ` Detenido desde ${new Date(kase.halted_at).toLocaleDateString("es-CL")}.`}
            </p>
          </div>
        </div>
      )}

      <CaseProgressChecklist
        caseId={kase.id}
        caseCode={kase.code}
        stage={kase.stage}
        userRole={session.user.role}
        lawyerNames={kase.abogados.map((a) => a.fullName)}
        hasUpdates={hasUpdates}
        hasResolutionDocument={hasResolutionDocument}
        blockedFromActions={blockedFromActions}
      />

      <div className="grid grid-cols-1 gap-5">
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InfoCard icon={User} label="Cliente" main={kase.client.fullName} sub={kase.client.phone} online={isOnline(kase.client.lastSeenAt)} />
            <InfoCard
              icon={Briefcase}
              label="Responsables"
              main={`Jefe: ${kase.jefeMesa?.fullName ?? "-"}`}
              sub={`Equipo: ${kase.abogados.map((a) => a.fullName).join(", ") || "Sin asignar"}`}
              online={kase.jefeMesa ? isOnline(kase.jefeMesa.lastSeenAt) : false}
              teamOnline={kase.abogados.map((a) => ({ name: a.fullName, online: isOnline(a.lastSeenAt) }))}
            />
            <InfoCard
              icon={FileText}
              label="Estado financiero"
              main={kase.is_paid ? "Solvente" : "Pago pendiente"}
              sub={kase.is_paid ? "Suscripcion activa" : "Verificar con administracion"}
              tone={kase.is_paid ? "ok" : "warn"}
            />
          </div>

          {!isFinished && session.user.role !== Role.CLIENTE && (
            <HaltedOverlay stage={kase.stage} reason={kase.halted_reason ?? null} haltedAt={kase.halted_at ?? null}>
              <UpdateForm
                caseId={kase.id}
                disabled={blockedFromActions || !isInProgress}
                userRole={session.user.role}
              />
            </HaltedOverlay>
          )}

          <div className="space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2 ml-1">
              <FileText className="w-3.5 h-3.5" />
              Linea de Tiempo ({kase.updates.length} {kase.updates.length === 1 ? "registro" : "registros"})
            </h3>
            <div className="relative ml-4 pl-8 border-l-2 border-[var(--border-glass)] space-y-4 py-2">
              {kase.updates.length === 0 ? (
                <div className="text-sm text-[var(--text-muted)] italic">Aun no hay actualizaciones registradas.</div>
              ) : (
                kase.updates.map((u, i) => (
                  <div key={u.id} className="relative">
                    <div
                      className="absolute -left-[41px] top-0 w-5 h-5 rounded-full border-4"
                      style={{
                        background: i === 0 ? "var(--gold)" : "var(--border-glass)",
                        borderColor: "var(--bg)",
                      }}
                    />
                    <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md p-4 shadow-sm hover:border-[rgba(201,168,76,0.3)] transition-colors">
                      <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 flex items-center justify-between">
                        <span>{new Date(u.createdAt).toLocaleString("es-CL")}</span>
                        {i === 0 && (
                          <span className="bg-[rgba(201,168,76,0.1)] text-[var(--gold)] px-2 py-0.5 rounded text-[9px]">
                            Mas reciente
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap">
                        {u.description}
                      </p>
                      {u.document_url && (
                        <a
                          href={u.document_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-md text-[11px] font-bold transition-colors hover:bg-[rgba(201,168,76,0.1)]"
                          style={{ color: "var(--gold)", border: "1px solid rgba(201,168,76,0.3)" }}
                        >
                          <Download className="w-3.5 h-3.5" />
                          Descargar documento adjunto
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <details className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md overflow-hidden">
            <summary className="px-5 py-3 cursor-pointer text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2 hover:bg-[var(--surface-2)] transition-colors">
              <Shield className="w-3.5 h-3.5" />
              Registro de Auditoria ({auditLogs.length})
            </summary>
            <table className="w-full text-[10px] text-left">
              <thead className="bg-[var(--surface-2)] text-[var(--gold)] font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Accion</th>
                  <th className="px-4 py-2">Estado</th>
                  <th className="px-4 py-2">Mensaje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-glass)]">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-center text-[var(--text-muted)] italic">Sin registros de auditoria.</td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[var(--surface-2)] transition-colors">
                      <td className="px-4 py-2 whitespace-nowrap text-[var(--text-muted)]">
                        {new Date(log.createdAt).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="px-4 py-2 font-bold text-[var(--text)]">{log.action.replace(/_/g, " ")}</td>
                      <td className="px-4 py-2">
                        <span className={`px-1.5 py-0.5 rounded-sm font-bold uppercase ${
                          log.status === "ok" ? "bg-[rgba(52,211,153,0.1)] text-emerald-400" : log.status === "failed" ? "bg-[rgba(248,113,113,0.1)] text-red-400" : "bg-[var(--btn-dark-bg)] text-[var(--text-muted)]"
                        }`}>
                          {log.status ?? "INFO"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-[var(--text-muted)] max-w-xs truncate" title={log.message ?? ""}>{log.message}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </details>
        </div>
      </div>
    </div>
  );
}

function InfoCard({
  icon: Icon, label, main, sub, tone, online, teamOnline,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  main: string;
  sub?: string;
  tone?: "ok" | "warn";
  online?: boolean;
  teamOnline?: { name: string; online: boolean }[];
}) {
  const mainColor = tone === "ok" ? "#4ADE80" : tone === "warn" ? "var(--gold)" : "var(--text)";
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2 text-[var(--text-muted)]">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {online !== undefined && (
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${online ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" : "bg-slate-300"}`} title={online ? "En linea" : "Desconectado"} />
        )}
        <div className="text-sm font-bold" style={{ color: mainColor }}>{main}</div>
      </div>
      {sub && <div className="text-[11px] text-[var(--text-muted)] mt-1">{sub}</div>}
      {teamOnline && teamOnline.length > 0 && (
        <div className="mt-2 space-y-1">
          {teamOnline.map((m) => (
            <div key={m.name} className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${m.online ? "bg-emerald-400" : "bg-slate-300"}`} />
              <span className="text-[10px] text-[var(--text-muted)]">{m.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
