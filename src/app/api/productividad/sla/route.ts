import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { Role } from "@prisma/client";
import { z } from "zod";
import { computeSlaStatus } from "@/lib/productividad/sla";

const CreateSlaSchema = z.object({
  categoryId: z.string().uuid(),
  maxDays: z.number().int().min(1).max(3650),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const data = await withRls(async (tx) => {
      const definitions = await tx.slaDefinition.findMany({
        include: { category: true, createdBy: { select: { fullName: true } } },
        orderBy: { category: { name: "asc" } },
      });

      const activeCases = await tx.case.findMany({
        where: { stage: { notIn: ["FINISHED"] } },
        select: {
          id: true,
          code: true,
          stage: true,
          createdAt: true,
          halted_at: true,
          resolvedAt: true,
          categoria: { select: { name: true, slaDefinition: true } },
          abogados: { select: { id: true, fullName: true } },
        },
      });

      const slaStatuses = activeCases.map((c) => {
        const slaDef = c.categoria?.slaDefinition;
        if (!slaDef || !slaDef.active) {
          return { caseId: c.id, code: c.code, status: "SIN_SLA" as const, slaDef: null, case: c };
        }
        const result = computeSlaStatus(
          { createdAt: c.createdAt, stage: c.stage, halted_at: c.halted_at, resolvedAt: c.resolvedAt },
          slaDef.maxDays
        );
        return { caseId: c.id, code: c.code, slaDef, case: c, ...result };
      });

      return { definitions, slaStatuses };
    });

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    if (session.user.role !== Role.SUPER_ADMIN && session.user.role !== Role.JEFE_DE_MESA) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }

    const body = await req.json();

    // Handle PATCH-style update (toggle active) or create
    if (body.action === "toggle" && body.id) {
      const updated = await withRls(async (tx) => {
        const existing = await tx.slaDefinition.findUnique({ where: { id: body.id } });
        if (!existing) throw new Error("SLA no encontrado");
        return tx.slaDefinition.update({ where: { id: body.id }, data: { active: !existing.active } });
      });
      return NextResponse.json({ definition: updated });
    }

    const parsed = CreateSlaSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

    const definition = await withRls(async (tx) => {
      return tx.slaDefinition.upsert({
        where: { categoryId: parsed.data.categoryId },
        update: { maxDays: parsed.data.maxDays, active: true },
        create: { categoryId: parsed.data.categoryId, maxDays: parsed.data.maxDays, createdById: session.user.id },
        include: { category: true },
      });
    });

    return NextResponse.json({ definition }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
