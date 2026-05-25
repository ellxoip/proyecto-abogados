import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { Role } from "@/lib/db-enums";

const STAFF_ROLES = new Set<string>([Role.SUPER_ADMIN, Role.JEFE_DE_MESA, Role.ABOGADO]);

const CreateBody = z.object({
  body: z.string().trim().min(1, "Nota vacía").max(4000),
  date: z.string().datetime().nullable().optional(),
  pinned: z.boolean().optional(),
});

const UpdateBody = z.object({
  id: z.string().uuid(),
  body: z.string().trim().min(1).max(4000).optional(),
  date: z.string().datetime().nullable().optional(),
  pinned: z.boolean().optional(),
});

function gateStaff(role: string) {
  return STAFF_ROLES.has(role);
}

/**
 * GET /api/admin/agenda/notas
 *
 * Lista las notas privadas del usuario autenticado. No expone notas de
 * otros usuarios — cada staff tiene su libreta personal asociada al
 * calendario.
 */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  if (!gateStaff(session.user.role)) {
    return NextResponse.json({ ok: false, error: "Acceso restringido" }, { status: 403 });
  }

  const notes = await withRls((tx) =>
    tx.calendarNote.findMany({
      where: { userId: session.user.id },
      orderBy: [{ pinned: "desc" }, { date: "desc" }, { createdAt: "desc" }],
    }),
  );
  return NextResponse.json({
    ok: true,
    notes: notes.map((n) => ({
      id: n.id,
      body: n.body,
      date: n.date ? n.date.toISOString() : null,
      pinned: n.pinned,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  if (!gateStaff(session.user.role)) {
    return NextResponse.json({ ok: false, error: "Acceso restringido" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = CreateBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }

  const note = await withRls((tx) =>
    tx.calendarNote.create({
      data: {
        userId: session.user.id,
        body: parsed.data.body,
        date: parsed.data.date ? new Date(parsed.data.date) : null,
        pinned: parsed.data.pinned ?? false,
      },
    }),
  );
  return NextResponse.json({ ok: true, note: { id: note.id } }, { status: 201 });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  if (!gateStaff(session.user.role)) {
    return NextResponse.json({ ok: false, error: "Acceso restringido" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = UpdateBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }

  const updated = await withRls(async (tx) => {
    const existing = await tx.calendarNote.findFirst({
      where: { id: parsed.data.id, userId: session.user.id },
      select: { id: true },
    });
    if (!existing) return null;
    return tx.calendarNote.update({
      where: { id: existing.id },
      data: {
        body: parsed.data.body ?? undefined,
        date: parsed.data.date === undefined ? undefined : parsed.data.date ? new Date(parsed.data.date) : null,
        pinned: parsed.data.pinned ?? undefined,
      },
    });
  });
  if (!updated) return NextResponse.json({ ok: false, error: "Nota no encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  if (!gateStaff(session.user.role)) {
    return NextResponse.json({ ok: false, error: "Acceso restringido" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const id = (searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id requerido" }, { status: 400 });

  const removed = await withRls(async (tx) => {
    const existing = await tx.calendarNote.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!existing) return false;
    await tx.calendarNote.delete({ where: { id: existing.id } });
    return true;
  });
  if (!removed) return NextResponse.json({ ok: false, error: "Nota no encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
