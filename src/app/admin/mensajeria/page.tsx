import Link from "next/link";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { CommentType, Role } from "@prisma/client";
import { CategoryBadge } from "@/components/CategoryBadge";
import { isOnline } from "@/lib/update-presence";
import { MessageSquare, Lock, Users, ArrowRight, Crown, Scale, Mail, Phone } from "lucide-react";

type Conversation = {
  caseId: string;
  caseCode: string;
  categoria: any | null;
  clientName: string;
  preview: string;
  authorId: string;
  type: CommentType;
  at: Date;
  unreadCount: number;
};

type TeamMember = {
  id: string;
  fullName: string;
  role: Role;
  email: string;
  phone: string;
  lastSeenAt: Date | null;
  caseCount: number;
};

function buildWhatsAppLink(phone: string, fullName: string) {
  const cleaned = phone.replace(/[^\d]/g, "");
  if (!cleaned) return null;
  const greeting = encodeURIComponent(`Hola ${fullName.split(" ")[0]}, te escribo desde AT INFORMA.`);
  return `https://wa.me/${cleaned}?text=${greeting}`;
}

export default async function MensajeriaPage() {
  const session = await auth();
  const role = session!.user.role;

  const { conversations, teamMembers } = await withRls(async (tx) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recent = await tx.comment.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        case: {
          select: {
            id: true,
            code: true,
            categoria: true,
            client: { select: { fullName: true } },
          },
        },
      },
    });

    const grouped = new Map<string, Conversation>();
    for (const c of recent) {
      const key = `${c.caseId}:${c.type}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.unreadCount++;
        continue;
      }
      grouped.set(key, {
        caseId: c.caseId,
        caseCode: c.case.code,
        categoria: c.case.categoria,
        clientName: c.case.client.fullName,
        preview: c.body.slice(0, 140),
        authorId: c.authorId,
        type: c.type,
        at: c.createdAt,
        unreadCount: 1,
      });
    }
    const convos = Array.from(grouped.values()).sort((a, b) => b.at.getTime() - a.at.getTime());

    // Fetch team members (abogados + jefes) with their active case count
    const staff = await tx.user.findMany({
      where: {
        role: { in: [Role.ABOGADO, Role.JEFE_DE_MESA] },
        active: true,
      },
      select: {
        id: true,
        fullName: true,
        role: true,
        email: true,
        phone: true,
        lastSeenAt: true,
        _count: {
          select: { casesAsLawyer: true, casesAsJefeMesa: true },
        },
      },
      orderBy: { fullName: "asc" },
    });

    const members: TeamMember[] = staff
      .filter((s) => s.id !== session!.user.id)
      .map((s) => ({
        id: s.id,
        fullName: s.fullName,
        role: s.role,
        email: s.email,
        phone: s.phone,
        lastSeenAt: s.lastSeenAt,
        caseCount: s.role === Role.JEFE_DE_MESA ? s._count.casesAsJefeMesa : s._count.casesAsLawyer,
      }));

    return { conversations: convos, teamMembers: members };
  });

  const internal = conversations.filter((c) => c.type === CommentType.INTERNAL);
  const publicConv = conversations.filter((c) => c.type === CommentType.PUBLIC);

  const onlineCount = teamMembers.filter((m) => isOnline(m.lastSeenAt)).length;

  return (
    <div className="max-w-7xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--text)]" style={{ fontFamily: "'Playfair Display', serif" }}>
          Mensajería
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1 font-medium">
          Historial reciente de conversaciones (últimos 30 días). El acceso por caso/canal está protegido por RLS.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Stat label="Casos con actividad" value={new Set(conversations.map((c) => c.caseId)).size} icon={MessageSquare} accent="var(--gold)" />
        <Stat label="Conversaciones internas" value={internal.length} icon={Lock} accent="var(--bg)" />
        <Stat label="Conversaciones con cliente" value={publicConv.length} icon={Users} accent="#60A5FA" />
        <Stat label="Equipo en línea" value={onlineCount} icon={Users} accent="#4ADE80" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: conversations */}
        <div className="lg:col-span-2 space-y-6">
          {role !== Role.CLIENTE && (
            <Section
              title="Equipo (Interno)"
              icon={Lock}
              conversations={internal}
              emptyText="No hay mensajes internos recientes."
            />
          )}

          <Section
            title="Cliente (Público)"
            icon={Users}
            conversations={publicConv}
            emptyText="No hay conversaciones recientes con clientes."
          />
        </div>

        {/* Right: team directory */}
        <div className="lg:col-span-1">
          <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md shadow-sm overflow-hidden sticky top-24">
            <div className="px-5 py-3 bg-[var(--bg)] flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--gold)]">
                Directorio del Equipo
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-emerald-300 font-bold">{onlineCount}</span>
              </span>
            </div>

            <div className="divide-y divide-[var(--border-glass)] max-h-[600px] overflow-y-auto">
              {teamMembers.length === 0 ? (
                <div className="p-8 text-center text-sm text-[var(--text-muted)]">No hay miembros registrados.</div>
              ) : (
                teamMembers.map((m) => {
                  const online = isOnline(m.lastSeenAt);
                  const whatsappUrl = buildWhatsAppLink(m.phone, m.fullName);
                  return (
                    <div
                      key={m.id}
                      className="px-5 py-3.5 hover:bg-[var(--surface-2)] transition-colors"
                    >
                      <Link
                        href={`/admin/mensajeria/equipo/${m.id}`}
                        className="flex items-center gap-3 group"
                      >
                        <span
                          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                            online
                              ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"
                              : "bg-slate-300"
                          }`}
                          title={online ? "En línea" : "Desconectado"}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-[var(--text)] truncate group-hover:text-[var(--gold)] transition-colors">
                            {m.fullName}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                              {m.role === Role.JEFE_DE_MESA ? (
                                <><Crown className="w-3 h-3 text-[var(--gold)]" /> Jefe de Mesa</>
                              ) : (
                                <><Scale className="w-3 h-3 text-blue-500" /> Abogado</>
                              )}
                            </span>
                            <span className="text-[9px] text-[var(--text-muted)]">· {m.caseCount} casos</span>
                          </div>
                        </div>
                        {online && (
                          <span className="text-[8px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            En línea
                          </span>
                        )}
                      </Link>

                      {/* Acciones de comunicación */}
                      <div className="mt-2.5 ml-5 flex items-center gap-1.5">
                        <Link
                          href={`/admin/mensajeria/equipo/${m.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors"
                          style={{ background: "var(--gold-dim)", color: "var(--gold)", border: "1px solid var(--gold-border)" }}
                          title="Ver casos compartidos y chat interno"
                        >
                          <MessageSquare className="w-3 h-3" />
                          Chat
                        </Link>
                        {whatsappUrl && (
                          <a
                            href={whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-[rgba(34,197,94,0.15)]"
                            style={{ color: "#22C55E", border: "1px solid rgba(34,197,94,0.30)" }}
                            title={`WhatsApp ${m.phone}`}
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {m.email && (
                          <a
                            href={`mailto:${m.email}?subject=${encodeURIComponent("AT INFORMA - Coordinación")}`}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-[rgba(96,165,250,0.15)]"
                            style={{ color: "#60A5FA", border: "1px solid rgba(96,165,250,0.30)" }}
                            title={`Enviar email a ${m.email}`}
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  accent: string;
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 rounded-md" style={{ background: accent + "15" }}>
          <Icon className={`w-4 h-4`} style={{ color: accent }} />
        </div>
      </div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">{label}</div>
      <div className="text-2xl font-bold text-[var(--text)]">{value}</div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  conversations,
  emptyText,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  conversations: Conversation[];
  emptyText: string;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3 px-1">
        <Icon className="w-4 h-4 text-[var(--text-muted)]" />
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{title}</h2>
        <span className="text-[10px] text-[var(--text-muted)]">· {conversations.length}</span>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md shadow-sm divide-y divide-[var(--border-glass)] overflow-hidden">
        {conversations.length === 0 ? (
          <div className="p-12 text-center text-sm text-[var(--text-muted)]">{emptyText}</div>
        ) : (
          conversations.map((c) => (
            <Link
              key={`${c.caseId}:${c.type}:${c.at.toISOString()}`}
              href={`/admin/casos/${c.caseId}`}
              className="flex items-start gap-4 px-5 py-4 hover:bg-[var(--surface-2)] transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold text-[var(--text)] tracking-wider">{c.caseCode}</span>
                  <CategoryBadge category={c.categoria} />
                  <span className="text-[10px] text-[var(--text-muted)]">·</span>
                  <span className="text-xs text-[var(--text-muted)]">{c.clientName}</span>
                </div>
                <p className="text-xs text-[#4B5563] line-clamp-1 mt-0.5">{c.preview}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <span className="text-[10px] text-[var(--text-muted)] font-medium">
                  {relativeTime(c.at)}
                </span>
                {c.unreadCount > 1 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[var(--gold)20] text-[var(--gold)]">
                    +{c.unreadCount - 1}
                  </span>
                )}
                <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}

function relativeTime(d: Date) {
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} d`;
  return d.toLocaleDateString("es-CL");
}
