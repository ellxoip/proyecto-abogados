import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";

export async function GET() {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const notifications = await withRls(async (tx) => {
      return tx.notification.findMany({
        where: {
          userId: session.user.id,
          expiresAt: { gte: new Date() },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    });

    return NextResponse.json({ notifications });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await req.json();

    await withRls(async (tx) => {
      if (body.markAllRead) {
        await tx.notification.updateMany({
          where: { userId: session.user.id, read: false },
          data: { read: true },
        });
      } else if (body.id) {
        await tx.notification.update({
          where: { id: body.id, userId: session.user.id },
          data: { read: true },
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
