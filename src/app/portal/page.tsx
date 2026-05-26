import { withRls } from "@/lib/rls";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { CaseStage } from "@/lib/db-enums";
import { STAGE_MESSAGES } from "@/lib/case-health";
import { redirect } from "next/navigation";
import {
  Folder, MessageSquare, Lock, Scale, CheckCircle, Clock,
  AlertCircle, ChevronRight, FileText, Users, CalendarDays,
  Shield, Download,
} from "lucide-react";

export default async function PortalHome() {
  const session = await auth();
  if (!session) redirect("/login");

  const cases = await withRls((tx) =>
    tx.case.findMany({
      where: { client_id: session.user.id },
      include: {
        categoria: { select: { name: true } },
        abogados: { select: { fullName: true } },
        updates: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, document_url: true, description: true, createdAt: true },
        },
        comments: {
          where: { type: "PUBLIC" },
          include: { author: { select: { fullName: true } } },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        _count: { select: { updates: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
  );

  const firstName = session.user.name?.split(" ")[0] ?? "Cliente";
  const totalCases = cases.length;
  const activeCases = cases.filter(
    (c) => c.stage === CaseStage.IN_PROGRESS || c.stage === CaseStage.OPEN
  ).length;
  const finishedCases = cases.filter((c) => c.stage === CaseStage.FINISHED).length;

  const allMessages = cases
    .flatMap((c) => c.comments.map((msg) => ({ ...msg, caseCode: c.code, caseId: c.id })))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  return (
    <section className="space-y-8">
      {/* ── Welcome hero ── */}
      <div
        className="rounded-lg p-6 relative overflow-hidden"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-glass)",
          borderLeft: "3px solid var(--gold)",
        }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Scale className="w-4 h-4" style={{ color: "var(--gold)" }} />
              <span
                className="text-[10px] uppercase tracking-widest font-bold"
                style={{ color: "var(--gold)" }}
              >
                HIVE CONTROL · Portal de Seguimiento
              </span>
            </div>
            <h1
              className="text-2xl font-bold"
              style={{ color: "var(--text)", fontFamily: "'Playfair Display', serif" }}
            >
              Bienvenido, {firstName}
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Aquí puedes seguir el avance de tus procesos legales en tiempo real.
            </p>
          </div>

          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest flex-shrink-0"
            style={{
              background: "rgba(201,168,76,0.08)",
              border: "1px solid rgba(201,168,76,0.2)",
              color: "var(--gold)",
            }}
          >
            <Shield className="w-3 h-3" />
            Acceso verificado
          </div>
        </div>

        {/* Stats row */}
        {totalCases > 0 && (
          <div
            className="mt-5 pt-5 grid grid-cols-3 gap-4 border-t"
            style={{ borderColor: "var(--border-glass)" }}
          >
            <div className="text-center">
              <div
                className="text-3xl font-bold"
                style={{ color: "var(--gold)", fontFamily: "'Playfair Display', serif" }}
              >
                {totalCases}
              </div>
              <div
                className="text-[9px] uppercase tracking-widest mt-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                Total
              </div>
            </div>
            <div className="text-center">
              <div
                className="text-3xl font-bold"
                style={{ color: "#34D399", fontFamily: "'Playfair Display', serif" }}
              >
                {activeCases}
              </div>
              <div
                className="text-[9px] uppercase tracking-widest mt-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                Activos
              </div>
            </div>
            <div className="text-center">
              <div
                className="text-3xl font-bold"
                style={{ color: "var(--gold)", fontFamily: "'Playfair Display', serif" }}
              >
                {finishedCases}
              </div>
              <div
                className="text-[9px] uppercase tracking-widest mt-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                Concluidos
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Cases section ── */}
      <div>
        <div className="flex items-center gap-3 mb-5">
          <div
            className="p-2 rounded-md"
            style={{ background: "var(--surface)", border: "1px solid var(--border-glass)" }}
          >
            <Folder className="w-4 h-4" style={{ color: "var(--gold)" }} />
          </div>
          <div>
            <h2
              className="text-base font-bold"
              style={{ color: "var(--text)", fontFamily: "'Playfair Display', serif" }}
            >
              Mis Expedientes
            </h2>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              {totalCases} caso{totalCases !== 1 ? "s" : ""} registrado{totalCases !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {cases.length === 0 ? (
          <div
            className="text-center py-16 rounded-lg flex flex-col items-center gap-4"
            style={{ background: "var(--surface)", border: "1px solid var(--border-glass)" }}
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border-glass)" }}
            >
              <Folder className="w-7 h-7" style={{ color: "var(--text-muted)" }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                No tienes casos asignados
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                Comunícate con tu abogado para registrar tu expediente.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cases.map((c) => {
              const msg = STAGE_MESSAGES[c.stage];
              const isFinished = c.stage === CaseStage.FINISHED;
              const isActive = c.stage === CaseStage.IN_PROGRESS;
              const isBlocked =
                c.stage === CaseStage.HALTED_BY_PAYMENT ||
                c.stage === CaseStage.WAITING_CUOTAS;

              const stageProgress = isFinished ? 2 : isActive ? 1 : 0;

              const accent = isFinished
                ? { color: "var(--gold)", bg: "rgba(201,168,76,0.12)", label: "Concluido" }
                : isActive
                ? { color: "#34D399", bg: "rgba(52,211,153,0.1)", label: "En Curso" }
                : isBlocked
                ? { color: "#F87171", bg: "rgba(248,113,113,0.1)", label: "Atención" }
                : { color: "#60A5FA", bg: "rgba(96,165,250,0.1)", label: "Recibido" };

              const daysActive = Math.max(
                0,
                Math.floor(
                  (Date.now() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60 * 24)
                )
              );

              return (
                <Link key={c.id} href={`/portal/casos/${c.id}`} className="block group">
                  <article
                    className="rounded-lg h-full transition-all duration-200 overflow-hidden group-hover:shadow-lg"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border-glass)",
                      borderLeft: `3px solid ${accent.color}`,
                    }}
                  >
                    {/* Header */}
                    <div className="px-5 pt-5 pb-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            {c.is_delicate && (
                              <Lock className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                            )}
                            <span
                              className="font-bold text-base tracking-wider"
                              style={{
                                color: "var(--gold)",
                                fontFamily: "'Playfair Display', serif",
                              }}
                            >
                              {c.code}
                            </span>
                          </div>
                          <div
                            className="text-[10px] uppercase tracking-widest"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {c.categoria?.name ?? "Sin categoría"}
                          </div>
                        </div>

                        <div
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest flex-shrink-0"
                          style={{ background: accent.bg, color: accent.color }}
                        >
                          {isFinished ? (
                            <CheckCircle className="w-2.5 h-2.5" />
                          ) : isBlocked ? (
                            <AlertCircle className="w-2.5 h-2.5" />
                          ) : (
                            <Clock className="w-2.5 h-2.5" />
                          )}
                          {accent.label}
                        </div>
                      </div>

                      <p
                        className="text-xs leading-relaxed line-clamp-2 mt-3"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {msg.description}
                      </p>
                    </div>

                    {/* Mini stepper */}
                    <div
                      className="px-5 py-3 border-t border-b"
                      style={{
                        borderColor: "var(--border-glass)",
                        background: "var(--surface-2)",
                      }}
                    >
                      <div className="flex items-center gap-1">
                        {(["Recibido", "En Curso", "Concluido"] as const).map((step, i) => (
                          <div key={i} className="flex items-center gap-1 flex-1">
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{
                                  background:
                                    i <= stageProgress ? accent.color : "var(--border-glass)",
                                  boxShadow:
                                    i === stageProgress
                                      ? `0 0 5px ${accent.color}`
                                      : "none",
                                }}
                              />
                              <span
                                className="text-[9px] uppercase tracking-wide font-bold whitespace-nowrap"
                                style={{
                                  color:
                                    i <= stageProgress ? "var(--text)" : "var(--text-muted)",
                                }}
                              >
                                {step}
                              </span>
                            </div>
                            {i < 2 && (
                              <div
                                className="flex-1 h-px mx-1"
                                style={{
                                  background:
                                    i < stageProgress ? accent.color : "var(--border-glass)",
                                  opacity: 0.4,
                                }}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="px-5 py-3 flex items-center justify-between">
                      <div
                        className="flex items-center gap-3 text-[10px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <div className="flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          {daysActive}d activo
                        </div>
                        <div className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {c._count.updates} actualiz.
                        </div>
                        {c.abogados.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            <span className="truncate max-w-[80px]">
                              {c.abogados[0].fullName.split(" ")[0]}
                            </span>
                          </div>
                        )}
                      </div>

                      <div
                        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest"
                        style={{ color: isFinished ? "var(--gold)" : accent.color }}
                      >
                        {isFinished ? (
                          <>
                            <Download className="w-3 h-3" />
                            Resultado
                          </>
                        ) : (
                          <>
                            Ver
                            <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Recent messages ── */}
      <div>
        <div className="flex items-center gap-3 mb-5">
          <div
            className="p-2 rounded-md"
            style={{ background: "var(--surface)", border: "1px solid var(--border-glass)" }}
          >
            <MessageSquare className="w-4 h-4" style={{ color: "var(--gold)" }} />
          </div>
          <div>
            <h2
              className="text-base font-bold"
              style={{ color: "var(--text)", fontFamily: "'Playfair Display', serif" }}
            >
              Mensajes Recientes
            </h2>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Últimas actualizaciones de tus abogados
            </p>
          </div>
        </div>

        <div
          className="rounded-lg overflow-hidden"
          style={{ background: "var(--surface)", border: "1px solid var(--border-glass)" }}
        >
          {allMessages.length === 0 ? (
            <div className="py-14 flex flex-col items-center gap-3 text-center px-6">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border-glass)" }}
              >
                <MessageSquare className="w-5 h-5" style={{ color: "var(--text-muted)" }} />
              </div>
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                Sin mensajes aún
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Tu abogado te enviará actualizaciones aquí.
              </p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--border-glass)" }}>
              {allMessages.map((msg) => (
                <Link
                  key={msg.id}
                  href={`/portal/casos/${msg.caseId}`}
                  className="flex items-start gap-4 px-5 py-4 transition-colors group"
                  style={{ color: "inherit" }}
                >
                  {/* Author initials */}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
                    style={{
                      background: "rgba(201,168,76,0.1)",
                      border: "1px solid rgba(201,168,76,0.25)",
                      color: "var(--gold)",
                    }}
                  >
                    {msg.author.fullName
                      .split(" ")
                      .slice(0, 2)
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className="text-[10px] font-bold uppercase tracking-widest"
                        style={{ color: "var(--gold)" }}
                      >
                        {msg.caseCode}
                      </span>
                      <span style={{ color: "var(--border-glass)" }}>·</span>
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wide"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {msg.author.fullName}
                      </span>
                    </div>
                    <p
                      className="text-sm line-clamp-1 group-hover:line-clamp-none transition-all"
                      style={{ color: "var(--text)" }}
                    >
                      {msg.body}
                    </p>
                  </div>

                  <div
                    className="text-[10px] whitespace-nowrap pt-0.5 flex-shrink-0"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {new Date(msg.createdAt).toLocaleDateString("es-CL")}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
