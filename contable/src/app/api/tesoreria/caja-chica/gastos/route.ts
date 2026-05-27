import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkMutationRole } from "@/server/auth/roles";

const GastoSchema = z.object({
  fondo_id: z.number().int().positive(),
  descripcion: z.string().min(1),
  monto: z.number().positive(),
  fecha_gasto: z.string().min(1),
  categoria: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const fondo_id = sp.get("fondo_id");
  const sin_rendicion = sp.get("sin_rendicion") === "true";

  const where: Record<string, unknown> = {};
  if (fondo_id) where.fondo_id = Number(fondo_id);
  if (sin_rendicion) where.rendicion_id = null;

  const gastos = await prisma.gastoCajaChica.findMany({
    where,
    include: {
      fondo: { select: { id: true, nombre: true } },
      responsable: { select: { nombre: true } },
    },
    orderBy: { fecha_gasto: "desc" },
    take: 300,
  });
  return NextResponse.json(gastos);
}

export async function POST(req: NextRequest) {
  const { session, error: authError } = await checkMutationRole();
  if (authError) return authError;

  const parsed = GastoSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", detalles: parsed.error.flatten() }, { status: 400 });

  const { fondo_id, descripcion, monto, fecha_gasto, categoria: catParsed } = parsed.data;
  const categoria = catParsed || "Otros";

  const fondo = await prisma.fondoCajaChica.findUnique({ where: { id: Number(fondo_id) } });
  if (!fondo) return NextResponse.json({ error: "Fondo no encontrado" }, { status: 404 });
  if (Number(fondo.saldo_actual) < Number(monto)) {
    return NextResponse.json({ error: "Saldo insuficiente en el fondo" }, { status: 400 });
  }

  const [gasto] = await prisma.$transaction([
    prisma.gastoCajaChica.create({
      data: {
        fondo_id: Number(fondo_id),
        categoria,
        descripcion,
        monto: Number(monto),
        fecha_gasto: new Date(fecha_gasto),
        responsable_id: Number(session.userId),
      },
    }),
    prisma.fondoCajaChica.update({
      where: { id: Number(fondo_id) },
      data: { saldo_actual: { decrement: Number(monto) } },
    }),
  ]);
  return NextResponse.json(gasto, { status: 201 });
}
