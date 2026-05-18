import { notFound } from "next/navigation";
import { withRls } from "@/lib/rls";
import { auth } from "@/lib/auth";
import { CaseStage, CommentType } from "@/lib/db-enums";
import { ClientChat } from "@/components/messenger/ClientChat";
import { RealtimeCaseSync } from "@/components/RealtimeCaseSync";
import { generateSupabaseToken } from "@/lib/supabase-jwt";
import { getStageMessage } from "@/lib/case-health";
import {
  Clock, CheckCircle, MessageSquare, History, Shield, CreditCard,
  Lock, Scale, Users, CalendarDays, FileText, ChevronRight, AlertTriangle,
} from "lucide-react";

import { isCaseVerified, hasDownloadAccess } from "@/app/portal/actions-security";
import { DocumentDownloadGate } from "@/components/DocumentDownloadGate";
import { IdentityChallenge } from "@/components/IdentityChallenge";
import { SatisfactionWidget } from "@/components/SatisfactionWidget";
import { PaymentProofUploader } from "@/components/PaymentProofUploader";

export default async function PortalCaseDetail({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return notFound();

  const kase = await withRls((tx) =>
    tx.case.findFirst({
      where: { id: params.id, client_id: session.user.id },
      include: {
        updates: { orderBy: { createdAt: "desc" } },
        categoria: { select: { name: true } },
        abogados: { select: { id: true, fullName: true } },
        jefeMesa: { select: { id: true, fullName: true } },
        comments: {
          where: { type: CommentType.PUBLIC },
          include: { author: { select: { fullName: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    })
  );

  if (!kase) return notFound();

  const needsVerification = kase.is_delicate && !(await isCaseVerified(kase.id));
  if (needsVerification) {
    return <IdentityChallenge caseId={kase.id} caseCode={kase.code} />;
  }

  const isFinished = kase.stage === CaseStage.FINISHED;
  const isInProgress = kase.stage === CaseStage.IN_PROGRESS;
  const isBlocked = kase.stage === CaseStage.HALTED_BY_PAYMENT || kase.stage === CaseStage.WAITING_CUOTAS;
  const realtimeToken = generateSupabaseToken(session.user.id, session.user.role);
  const dlUnlocked = await hasDownloadAccess(kase.id);

  const commentsDTO = kase.comments.map((c) => ({
    id: c.id,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    authorId: c.authorId,
    authorName: c.author.fullName,
  }));

  const finishUpdate = kase.updates.find(
    (u) => u.document_url && u.description.toLowerCase().includes("concluido")
  );

  const daysActive = Math.max(
    0,
    Math.floor((Date.now() - new Date(kase.createdAt).getTime()) / (1000 * 60 * 60 * 24))
  );

  // Stage progress: 0=received, 1=in_progress, 2=finished
  const stageProgress = isFinished ? 2 : isInProgress ? 1 : 0;

  const stageSteps = [
    { label: "Caso Recibido", sublabel: "Expediente abierto" },
    { label: "En Desarrollo", sublabel: "Equipo trabajando" },
    { label: "Concluido", sublabel: "Proceso finalizado" },
  ];

  const message = getStageMessage(kase.stage);

  function initials(name: string) {
    return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <RealtimeCaseSync caseId={kase.id} realtimeToken={realtimeToken} />

      {/* ── HERO HEADER ── */}
      <header
        className="rounded-xl shadow-xl relative overflow-hidden"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-subtle)",
          borderLeft: "4px solid var(--gold)",
        }}
      >
        <div className="absolute top-0 right-0 w-96 h-48 opacity-[0.04] blur-[80px]"
          style={{ background: "var(--gold)" }} />

        <div className="relative p-6 sm:p-8">
          {/* Top row */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Scale className="w-3.5 h-3.5" style={{ color: "var(--gold)" }} />
                <span className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: "var(--gold)" }}>
                  Expediente Legal
                </span>
                {kase.is_delicate && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest text-blue-500 border border-blue-500/30 bg-blue-500/10">
                    <Lock className="w-2.5 h-2.5" />
                    Protegido
                  </span>
                )}
              </div>
              <h1
                className="text-3xl sm:text-4xl font-bold tracking-tight"
                style={{ fontFamily: "'Playfair Display', serif", color: "var(--text)" }}
              >
                {kase.code}
              </h1>
            </div>

            <div className="flex flex-wrap gap-2 items-start">
              <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded border ${
                kase.is_paid
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                  : "bg-red-500/10 text-red-500 border-red-500/30"
              }`}>
                {kase.is_paid ? "✓ Suscripción al día" : "⚠ Pago pendiente"}
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded border ${
                isFinished
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                  : isBlocked
                  ? "bg-red-500/10 text-red-500 border-red-500/30"
                  : "text-[var(--gold)] border-[rgba(201,168,76,0.3)] bg-[rgba(201,168,76,0.08)]"
              }`}>
                {isFinished ? "Caso Concluido" : isInProgress ? "En Desarrollo" : isBlocked ? "Suspendido" : "Activo"}
              </span>
            </div>
          </div>

          {/* Stats mini-row */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs" style={{ color: "var(--text-muted)" }}>
            <span className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" style={{ color: "var(--gold)" }} />
              Actualizado {new Date(kase.updatedAt).toLocaleDateString("es-CL")}
            </span>
            <span className="hidden sm:inline" style={{ color: "var(--border-subtle)" }}>|</span>
            <span className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              {kase.categoria?.name ?? "General"}
            </span>
            <span className="hidden sm:inline" style={{ color: "var(--border-subtle)" }}>|</span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {daysActive === 0 ? "Abierto hoy" : `${daysActive} día${daysActive !== 1 ? "s" : ""} activo`}
            </span>
            <span className="hidden sm:inline" style={{ color: "var(--border-subtle)" }}>|</span>
            <span className="flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              {kase.updates.length} actualización{kase.updates.length !== 1 ? "es" : ""}
            </span>
          </div>
        </div>
      </header>

      {/* ── STAGE PROGRESS STEPPER ── */}
      <div
        className="rounded-xl px-6 py-5"
        style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)" }}
      >
        <div className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-muted)" }}>
          Progreso del Expediente
        </div>
        <div className="flex items-center">
          {stageSteps.map((step, i) => {
            const done = i < stageProgress;
            const active = i === stageProgress && !isBlocked;
            const blocked = isBlocked && i === 1;
            return (
              <div key={i} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                    style={{
                      background: done || (isFinished && i <= 2)
                        ? "var(--gold)"
                        : active
                        ? "rgba(201,168,76,0.15)"
                        : blocked
                        ? "rgba(239,68,68,0.15)"
                        : "var(--surface-2)",
                      border: done || (isFinished && i <= 2)
                        ? "2px solid var(--gold)"
                        : active
                        ? "2px solid var(--gold)"
                        : blocked
                        ? "2px solid rgba(239,68,68,0.6)"
                        : "2px solid var(--border-subtle)",
                      color: done || (isFinished && i <= 2)
                        ? "#0A0A0A"
                        : active
                        ? "var(--gold)"
                        : blocked
                        ? "#EF4444"
                        : "var(--text-muted)",
                    }}
                  >
                    {done || (isFinished && i < 2) ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : blocked ? (
                      <AlertTriangle className="w-4 h-4" />
                    ) : (
                      <span>{i + 1}</span>
                    )}
                  </div>
                  <div className="text-center hidden sm:block">
                    <div
                      className="text-[11px] font-bold"
                      style={{ color: active || done ? "var(--text)" : "var(--text-muted)" }}
                    >
                      {step.label}
                    </div>
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {step.sublabel}
                    </div>
                  </div>
                </div>

                {i < stageSteps.length - 1 && (
                  <div
                    className="flex-1 h-0.5 mx-2"
                    style={{
                      background: i < stageProgress
                        ? "var(--gold)"
                        : "var(--border-subtle)",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── STATUS BANNER ── */}
      <div
        className="rounded-xl p-5 flex items-start gap-4"
        style={{
          background: isFinished
            ? "rgba(52,211,153,0.08)"
            : isBlocked
            ? "rgba(239,68,68,0.08)"
            : "rgba(96,165,250,0.08)",
          border: `1px solid ${isFinished ? "rgba(52,211,153,0.25)" : isBlocked ? "rgba(239,68,68,0.25)" : "rgba(96,165,250,0.25)"}`,
        }}
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: isFinished
              ? "rgba(52,211,153,0.15)"
              : isBlocked
              ? "rgba(239,68,68,0.15)"
              : "rgba(96,165,250,0.15)",
          }}
        >
          {isFinished ? (
            <Shield className="w-5 h-5 text-emerald-400" />
          ) : isBlocked ? (
            <CreditCard className="w-5 h-5 text-red-400" />
          ) : (
            <Clock className="w-5 h-5 text-blue-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm mb-0.5"
            style={{ color: isFinished ? "#34D399" : isBlocked ? "#F87171" : "#60A5FA" }}>
            {message.title}
          </div>
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>
            {message.description}
          </div>
          {isBlocked && (
            <div className="mt-3">
              <PaymentProofUploader caseId={kase.id} />
            </div>
          )}
        </div>
      </div>

      {/* ── COMPLETION CERTIFICATE ── */}
      {isFinished && finishUpdate?.document_url && (
        <div
          className="rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between gap-5 shadow-lg"
          style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.3)" }}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: "rgba(201,168,76,0.15)" }}>
              <CheckCircle className="w-6 h-6" style={{ color: "var(--gold)" }} />
            </div>
            <div>
              <h3 className="font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "var(--text)" }}>
                Certificado de Término Disponible
              </h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Su proceso ha concluido. Descargue su documentación oficial.
              </p>
            </div>
          </div>
          <DocumentDownloadGate
            caseId={kase.id}
            documentUrl={finishUpdate.document_url}
            label="Descargar Certificado"
            alreadyUnlocked={dlUnlocked}
          />
        </div>
      )}

      {/* ── SATISFACTION ── */}
      {isFinished && (
        <SatisfactionWidget caseId={kase.id} initialValue={kase.satisfaction} />
      )}

      {/* ── MAIN GRID ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* LEFT: Updates timeline */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
              <h2 className="text-base font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "var(--text)" }}>
                Historial de Actualizaciones
              </h2>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded"
              style={{ background: "rgba(201,168,76,0.1)", color: "var(--gold)" }}>
              {kase.updates.length} registro{kase.updates.length !== 1 ? "s" : ""}
            </span>
          </div>

          {kase.updates.length === 0 ? (
            <div
              className="rounded-xl p-10 text-center space-y-3"
              style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)" }}
            >
              <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center"
                style={{ background: "rgba(201,168,76,0.1)" }}>
                <FileText className="w-5 h-5" style={{ color: "var(--gold)" }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  Sin actualizaciones aún
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  Su equipo legal registrará los avances aquí. Recibirá notificaciones en cada hito.
                </p>
              </div>
              <div className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-widest"
                style={{ color: "var(--gold)" }}>
                <Clock className="w-3 h-3" />
                Seguimiento en tiempo real activo
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {kase.updates.map((u, i) => (
                <div
                  key={u.id}
                  className="rounded-xl p-5 group transition-all hover:shadow-md"
                  style={{
                    background: "var(--surface)",
                    border: i === 0 ? "1px solid rgba(201,168,76,0.3)" : "1px solid var(--border-subtle)",
                  }}
                >
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: i === 0 ? "var(--gold)" : "var(--border-subtle)" }}
                      />
                      <span className="text-[10px] font-bold uppercase tracking-widest"
                        style={{ color: i === 0 ? "var(--gold)" : "var(--text-muted)" }}>
                        {new Date(u.createdAt).toLocaleDateString("es-CL", {
                          day: "2-digit", month: "long", year: "numeric"
                        })} · {new Date(u.createdAt).toLocaleTimeString("es-CL", {
                          hour: "2-digit", minute: "2-digit"
                        })}
                      </span>
                    </div>
                    {i === 0 && (
                      <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded flex-shrink-0"
                        style={{ background: "rgba(201,168,76,0.12)", color: "var(--gold)", border: "1px solid rgba(201,168,76,0.3)" }}>
                        Último
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>
                    {u.description}
                  </p>
                  {u.document_url && (
                    <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      <DocumentDownloadGate
                        caseId={kase.id}
                        documentUrl={u.document_url}
                        alreadyUnlocked={dlUnlocked}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Legal team + Messaging */}
        <div className="lg:col-span-5 space-y-4">

          {/* Legal team card */}
          <div
            className="rounded-xl p-5"
            style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)" }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4" style={{ color: "var(--gold)" }} />
              <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--gold)" }}>
                Su Equipo Legal
              </span>
            </div>

            {kase.abogados.length === 0 && !kase.jefeMesa ? (
              <div className="text-center py-4 space-y-2">
                <div className="w-10 h-10 rounded-full mx-auto flex items-center justify-center"
                  style={{ background: "var(--surface-2)" }}>
                  <Users className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Equipo en proceso de asignación
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {kase.jefeMesa && (
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: "rgba(201,168,76,0.15)", color: "var(--gold)", border: "1px solid rgba(201,168,76,0.3)" }}
                    >
                      {initials(kase.jefeMesa.fullName)}
                    </div>
                    <div>
                      <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                        {kase.jefeMesa.fullName}
                      </div>
                      <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                        Jefe de Grupo
                      </div>
                    </div>
                  </div>
                )}
                {kase.abogados.map((a) => (
                  <div key={a.id} className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border-subtle)" }}
                    >
                      {initials(a.fullName)}
                    </div>
                    <div>
                      <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                        {a.fullName}
                      </div>
                      <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                        Abogado Asignado
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div
              className="mt-4 pt-3 flex items-center gap-1.5 text-[10px] font-semibold"
              style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Disponibles para consultas por mensajería
            </div>
          </div>

          {/* Messaging */}
          <div>
            <div className="flex items-center gap-2 mb-3 px-1">
              <MessageSquare className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
              <h2 className="text-base font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "var(--text)" }}>
                Mensajería con su Equipo
              </h2>
            </div>
            <div
              className="h-[560px] rounded-xl overflow-hidden shadow-xl flex flex-col sticky top-24"
              style={{ border: "1px solid var(--border-subtle)", background: "var(--surface)" }}
            >
              <ClientChat
                caseId={kase.id}
                initialComments={commentsDTO}
                realtimeToken={realtimeToken}
                currentUserId={session.user.id}
                isFinished={isFinished}
                role={session.user.role}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── QUICK INFO FOOTER ── */}
      <div
        className="rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center gap-3">
          <Scale className="w-4 h-4 flex-shrink-0" style={{ color: "var(--gold)" }} />
          <div>
            <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>
              HIVE CONTROL — Legal Operating System
            </p>
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Toda comunicación queda registrada y es parte oficial de su expediente.
            </p>
          </div>
        </div>
        <a
          href="/portal"
          className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors hover:opacity-80 flex-shrink-0"
          style={{ color: "var(--gold)" }}
        >
          Ver todos mis casos
          <ChevronRight className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
