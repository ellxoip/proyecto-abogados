import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/server/auth/session";

const schema = z.object({
  motivo: z.string().min(1).max(80),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    await requireSessionUser();
    const { id } = await params;
    const cuotaId = Number(id);
    if (!Number.isFinite(cuotaId) || cuotaId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json();
    const data = schema.parse(body);

    const cuota = await prisma.cuota.update({
      where: { id: cuotaId },
      data: {
        cobrable: false,
        motivo_no_cobrable: data.motivo.trim(),
      },
    });

    return NextResponse.json({ ok: true, id: cuota.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
