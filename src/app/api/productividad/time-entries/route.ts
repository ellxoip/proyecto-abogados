import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { ActivityCategory, Role } from "@prisma/client";
import { z } from "zod";

const CreateSchema = z.object({
  caseId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMinutes: z.number().int().min(1).max(1440),
  category: z.nativeEnum(ActivityCategory),
  description: z.string().max(500).optional(),
});

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const caseId = searchParams.get("caseId");
    const lawyerId = searchParams.get("lawyerId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const canSeeAll = session.user.role === Role.SUPER_ADMIN || session.user.role === Role.JEFE_DE_MESA;

    const entries = await withRls(async (tx) => {
      return tx.timeEntry.findMany({
        where: {
          ...(caseId ? { caseId } : {}),
          ...(lawyerId ? { lawyerId } : !canSeeAll ? { lawyerId: session.user.id } : {}),
          ...(from || to
            ? {
                date: {
                  ...(from ? { gte: new Date(from) } : {}),
                  ...(to ? { lte: new Date(to) } : {}),
                },
              }
            : {}),
        },
        include: {
          lawyer: { select: { id: true, fullName: true } },
          case: { select: { id: true, code: true } },
        },
        orderBy: { date: "desc" },
      });
    });

    return NextResponse.json({ entries });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
    }

    const { caseId, date, durationMinutes, category, description } = parsed.data;

    const entryDate = new Date(date + "T12:00:00Z");
    if (entryDate > new Date()) {
      return NextResponse.json({ error: "La fecha no puede ser futura" }, { status: 400 });
    }

    const entry = await withRls(async (tx) => {
      // Verify user has access to this case
      const kase = await tx.case.findUnique({
        where: { id: caseId },
        select: { id: true, abogados: { select: { id: true } } },
      });
      if (!kase) return null;

      const isAssigned = kase.abogados.some((a) => a.id === session.user.id);
      if (!isAssigned && session.user.role === Role.ABOGADO) {
        throw new Error("No tienes acceso a este expediente");
      }

      return tx.timeEntry.create({
        data: {
          caseId,
          lawyerId: session.user.id,
          date: entryDate,
          durationMinutes,
          category,
          description: description || null,
        },
        include: { lawyer: { select: { id: true, fullName: true } } },
      });
    });

    if (!entry) return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
