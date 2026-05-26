import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkMutationRole } from "@/server/auth/roles";
import { getSession } from "@/server/auth/session";

const ItemSchema = z.object({
  fecha_movimiento: z.string().min(1),
  glosa: z.string().min(1),
  cargo: z.number().nonnegative().optional(),
  abono: z.number().nonnegative().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const items = await prisma.itemConciliacion.findMany({
    where: { conciliacion_id: Number(id) },
    orderBy: { fecha_movimiento: "asc" },
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await checkMutationRole();
  if (error) return error;

  const { id } = await params;
  const conc = await prisma.conciliacionBancaria.findUnique({ where: { id: Number(id) } });
  if (!conc) return NextResponse.json({ error: "Conciliación no encontrada" }, { status: 404 });

  const body = await req.json();
  const items = Array.isArray(body) ? body : [body];

  const parsed = z.array(ItemSchema).safeParse(items);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", detalles: parsed.error.flatten() }, { status: 400 });

  const created = await prisma.itemConciliacion.createMany({
    data: parsed.data.map((i) => ({
      conciliacion_id: Number(id),
      fecha_movimiento: new Date(i.fecha_movimiento),
      glosa: i.glosa,
      cargo: i.cargo ?? null,
      abono: i.abono ?? null,
      conciliado: false,
    })),
  });

  return NextResponse.json({ created: created.count }, { status: 201 });
}
