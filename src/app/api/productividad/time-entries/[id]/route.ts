import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { ActivityCategory, Role } from "@prisma/client";
import { z } from "zod";
import { differenceInHours, differenceInDays } from "date-fns";

const UpdateSchema = z.object({
  durationMinutes: z.number().int().min(1).max(1440).optional(),
  category: z.nativeEnum(ActivityCategory).optional(),
  description: z.string().max(500).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await req.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

    const updated = await withRls(async (tx) => {
      const existing = await tx.timeEntry.findUnique({ where: { id: params.id } });
      if (!existing) return null;

      const isOwner = existing.lawyerId === session.user.id;
      const isAdmin = session.user.role === Role.SUPER_ADMIN;

      if (!isOwner && !isAdmin) throw new Error("Sin permiso para editar esta entrada");

      if (!isAdmin) {
        const daysSinceCreation = differenceInDays(new Date(), existing.createdAt);
        if (daysSinceCreation > 7) throw new Error("Solo se puede editar entradas de los últimos 7 días");
      }

      const data: Record<string, unknown> = { ...parsed.data };
      if (parsed.data.date) {
        data.date = new Date(parsed.data.date + "T12:00:00Z");
      }

      return tx.timeEntry.update({
        where: { id: params.id },
        data,
        include: { lawyer: { select: { id: true, fullName: true } } },
      });
    });

    if (!updated) return NextResponse.json({ error: "Entrada no encontrada" }, { status: 404 });
    return NextResponse.json({ entry: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    await withRls(async (tx) => {
      const existing = await tx.timeEntry.findUnique({ where: { id: params.id } });
      if (!existing) throw new Error("Entrada no encontrada");

      const isOwner = existing.lawyerId === session.user.id;
      const isAdmin = session.user.role === Role.SUPER_ADMIN;

      if (!isOwner && !isAdmin) throw new Error("Sin permiso");

      if (!isAdmin) {
        const hoursSinceCreation = differenceInHours(new Date(), existing.createdAt);
        if (hoursSinceCreation > 24) throw new Error("Solo se puede eliminar entradas creadas en las últimas 24 horas");
      }

      await tx.timeEntry.delete({ where: { id: params.id } });
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
