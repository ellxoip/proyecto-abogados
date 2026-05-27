import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { CommentType, Role } from "@/lib/db-enums";
import { isOnline } from "@/lib/update-presence";
import { ArrowLeft, ArrowRight, Crown, Mail, MessageSquare, Phone, Scale, ShieldAlert } from "lucide-react";

function buildWhatsAppLink(phone: string, fullName: string) {
  const cleaned = phone.replace(/[^\d]/g, "");
  if (!cleaned) return null;
  const greeting = encodeURIComponent(`Hola ${fullName.split(" ")[0]}, te escribo desde HIVE CONTROL.`);
  return `https://wa.me/${cleaned}?text=${greeting}`;
}

export default async function TeamMemberMessagingPage({ params }: { params: { userId: string } }) {
  const session = await auth();
  if (!session) return notFound();
  const role = session.user.role as Role;
  if (role === Role.CLIENTE) return notFound();
  if (params.userId === session.user.id) return notFound();

  const data = await withRls(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: params.userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        active: true,
        lastSeenAt: true,
        managedById: true,
      },
    });

    if (!target || !target.active) return null;
    if (target.role !== Role.ABOGADO && target.role !== Role.JEFE_DE_MESA) return null;

    // Casos donde ambos (yo + target) participan
    const myParticipationFilter =
      role === Role.SUPER_ADMIN
        ? {}
        : role === Role.JEFE_DE_MESA
        ? { OR: [{ jefe_mesa_id: session.user.id }, { abogados: { some: { managedById: session.user.id } } }] }
        : { abogados: { some: { id: session.user.id } } };

    const theirParticipationFilter =
      target.role === Role.JEFE_DE_MESA
        ? { OR: [{ jefe_mesa_id: target.id }, { abogados: { some: { managedById: target.id } } }] }
        : { abogados: { some: { id: target.id } } };

    const sharedCases = await tx.case.findMany({
      where: { AND: [myParticipationFilter, theirParticipationFilter] },
      orderBy: { updatedAt: "desc" },
      include: {
        client: { select: { fullName: true } },
        categoria: { select: { name: true } },
        comments: {
          where: { type: CommentType.INTERNAL },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, createdAt: true, author: { select: { fullName: true } } },
        },
      },
      take: 50,
    });

    return { target, sharedCases };
  });

  if (!data) return notFound();
  const { target, sharedCases } = data;
  const online = isOnline(target.lastSeenAt);
  const whatsappUrl = buildWhatsAppLink(target.phone, target.fullName);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link
        href="/admin/mensajeria"
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest"
        style={{ color: "var(--text-muted)" }}
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Volver a Mensajería
      </Link>

      <header className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4 min-w-0">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0"
              style={{ background: "var(--gold)", color: "#0F172A" }}
            >
              {target.fullName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-[var(--text)] font-serif truncate">{target.fullName}</h1>
              <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                {target.role === Role.JEFE_DE_MESA ? (
                  <span className="flex items-center gap-1"><Crown className="w-3 h-3 text-[var(--gold)]" /> Jefe de Grupo</span>
                ) : (
                  <span className="flex items-center gap-1"><Scale className="w-3 h-3 text-blue-500" /> Abogado</span>
                )}
                <span>·</span>
                <span className={online ? "text-emerald-500 font-bold" : "text-slate-400"}>
                  {online ? "En línea" : "Desconectado"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-colors"
                style={{ background: "rgba(34,197,94,0.12)", color: "#22C55E", border: "1px solid rgba(34,197,94,0.30)" }}
              >
                <Phone className="w-4 h-4" />
                WhatsApp
              </a>
            )}
            {target.email && (
              <a
                href={`mailto:${target.email}?subject=${encodeURIComponent("HIVE CONTROL - Coordinación")}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-colors"
                style={{ background: "rgba(96,165,250,0.12)", color: "#60A5FA", border: "1px solid rgba(96,165,250,0.30)" }}
              >
                <Mail className="w-4 h-4" />
                Email
              </a>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5 text-xs">
          <div className="flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
            <Mail className="w-3.5 h-3.5" />
            <span className="truncate">{target.email}</span>
          </div>
          <div className="flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
            <Phone className="w-3.5 h-3.5" />
            <span className="truncate">{target.phone || "Sin teléfono"}</span>
          </div>
        </div>
      </header>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--gold)] flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Casos compartidos ({sharedCases.length})
          </h2>
        </div>

        {sharedCases.length === 0 ? (
          <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md p-8 text-center">
            <ShieldAlert className="w-8 h-8 mx-auto mb-3 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text)]">No tienen casos en común actualmente.</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              El chat interno está disponible solo dentro de un expediente que ambos gestionen. Usá WhatsApp o Email para coordinación general.
            </p>
          </div>
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md divide-y divide-[var(--border-glass)] overflow-hidden">
            {sharedCases.map((c) => {
              const lastComment = c.comments[0];
              return (
                <Link
                  key={c.id}
                  href={`/admin/casos/${c.id}`}
                  className="flex items-start gap-4 px-5 py-4 hover:bg-[var(--surface-2)] transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-bold text-[var(--text)] tracking-wider">{c.code}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">·</span>
                      <span className="text-xs text-[var(--text-muted)]">{c.client.fullName}</span>
                      {c.categoria?.name && (
                        <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "var(--gold-dim)", color: "var(--gold)" }}>
                          {c.categoria.name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs line-clamp-1" style={{ color: "var(--text-muted)" }}>
                      {lastComment ? `${lastComment.author.fullName}: ${lastComment.body}` : "Sin mensajes internos todavía. Abrí el caso para iniciar la conversación."}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 mt-1 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
