import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { CommentType, Role } from "@/lib/db-enums";

type MessageSummary = {
  caseId: string;
  caseCode: string;
  clientName: string;
  body: string;
  authorName: string;
  authorId: string;
  type: CommentType;
  createdAt: string;
  isMine: boolean;
  isUnread: boolean;
};

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  if (session.user.role === Role.CLIENTE) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });

  const data = await withRls(async (tx) => {
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
        : { abogados: { some: { id: session.user.id } } };

    const cases = await tx.case.findMany({
      where: caseScope,
      select: { id: true },
    });
    const caseIds = cases.map((c) => c.id);
    if (caseIds.length === 0) return { unreadCount: 0, messages: [] as MessageSummary[] };

    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const [recent, reads] = await Promise.all([
      tx.comment.findMany({
        where: {
          caseId: { in: caseIds },
          createdAt: { gte: since },
        },
        orderBy: { createdAt: "desc" },
        take: 120,
        include: {
          case: {
            select: {
              id: true,
              code: true,
              client: { select: { fullName: true } },
            },
          },
          author: { select: { fullName: true } },
        },
      }),
      tx.conversationRead.findMany({
        where: { userId: session.user.id, caseId: { in: caseIds } },
        select: { caseId: true, type: true, lastReadAt: true },
      }),
    ]);

    const readMap = new Map<string, Date>();
    for (const r of reads) readMap.set(`${r.caseId}:${r.type}`, r.lastReadAt);

    const grouped = new Map<string, MessageSummary>();
    for (const c of recent) {
      const key = `${c.caseId}:${c.type}`;
      if (grouped.has(key)) continue;
      const isMine = c.authorId === session.user.id;
      const lastRead = readMap.get(key);
      const isUnread =
        !isMine && (!lastRead || c.createdAt.getTime() > lastRead.getTime());
      grouped.set(key, {
        caseId: c.case.id,
        caseCode: c.case.code,
        clientName: c.case.client.fullName,
        body: c.body.slice(0, 180),
        authorName: c.author.fullName,
        authorId: c.authorId,
        type: c.type,
        createdAt: c.createdAt.toISOString(),
        isMine,
        isUnread,
      });
    }

    const messages = Array.from(grouped.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const unreadCount = messages.filter((m) => m.isUnread).length;

    return { unreadCount, messages };
  });

  return NextResponse.json({ ok: true, ...data });
}
