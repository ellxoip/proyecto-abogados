import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { CommentType, Role } from "@/lib/db-enums";
import { isOnline } from "@/lib/update-presence";
import { MessengerCenter } from "@/components/messenger/MessengerCenter";

type Conversation = {
  caseId: string;
  caseCode: string;
  categoria: any | null;
  clientName: string;
  preview: string;
  authorId: string;
  type: CommentType;
  at: string;
  unreadCount: number;
};

type TeamMember = {
  id: string;
  fullName: string;
  role: Role;
  email: string;
  phone: string;
  lastSeenAt: string | null;
  caseCount: number;
};

export default async function MensajeriaPage() {
  const session = await auth();

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
        at: c.createdAt.toISOString(),
        unreadCount: 1,
      });
    }

    const convos = Array.from(grouped.values()).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

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
        lastSeenAt: s.lastSeenAt ? s.lastSeenAt.toISOString() : null,
        caseCount: s.role === Role.JEFE_DE_MESA ? s._count.casesAsJefeMesa : s._count.casesAsLawyer,
      }));

    return { conversations: convos, teamMembers: members };
  });

  const onlineCount = teamMembers.filter((m) => isOnline(m.lastSeenAt ? new Date(m.lastSeenAt) : null)).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <MessengerCenter
        conversations={conversations}
        teamMembers={teamMembers}
        onlineCount={onlineCount}
      />
    </div>
  );
}
