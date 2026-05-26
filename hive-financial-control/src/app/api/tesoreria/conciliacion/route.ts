import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";
import { checkMutationRole } from "@/server/auth/roles";

const CreateConciliacionSchema = z.object({
  cuenta_id: z.number().int().positive(),
  periodo: z.string().regex(/^\d{4}-\d{2}$/, "Formato: YYYY-MM"),
  saldo_banco: z.number(),
});

export async function GET(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const cuenta_id = sp.get("cuenta_id");
  const periodo = sp.get("periodo");

  const conciliaciones = await prisma.conciliacionBancaria.findMany({
    where: {
      ...(cuenta_id ? { cuenta_id: Number(cuenta_id) } : {}),
      ...(periodo ? { periodo } : {}),
    },
    include: {
      cuenta: { include: { banco: true } },
      _count: { select: { items: true } },
    },
    orderBy: [{ cuenta_id: "asc" }, { periodo: "desc" }],
    take: 100,
  });

  return NextResponse.json(conciliaciones);
}

export async function POST(req: NextRequest) {
  const { session, error } = await checkMutationRole();
  if (error) return error;

  const parsed = CreateConciliacionSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", detalles: parsed.error.flatten() }, { status: 400 });

  const { cuenta_id, periodo, saldo_banco } = parsed.data;

  const cuenta = await prisma.cuentaBancaria.findUnique({ where: { id: cuenta_id } });
  if (!cuenta) return NextResponse.json({ error: "Cuenta bancaria no encontrada" }, { status: 404 });

  const existente = await prisma.conciliacionBancaria.findFirst({ where: { cuenta_id, periodo } });
  if (existente) return NextResponse.json({ error: `Ya existe conciliación para cuenta ${cuenta_id} período ${periodo}` }, { status: 409 });

  // saldo_sistema calculado desde movimientos del período
  const [year, month] = periodo.split("-").map(Number);
  const fechaDesde = new Date(year, month - 1, 1);
  const fechaHasta = new Date(year, month, 0);

  const agg = await prisma.movimientoTesoreria.groupBy({
    by: ["tipo"],
    where: {
      cuenta_id,
      fecha_movimiento: { gte: fechaDesde, lte: fechaHasta },
    },
    _sum: { monto: true },
  });

  const ingresos = Number(agg.find((r) => r.tipo === "INGRESO")?._sum?.monto ?? 0);
  const egresos = Number(agg.find((r) => r.tipo === "EGRESO")?._sum?.monto ?? 0);
  const saldo_sistema = Number(cuenta.saldo_inicial) + ingresos - egresos;
  const diferencia = saldo_banco - saldo_sistema;

  const conciliacion = await prisma.conciliacionBancaria.create({
    data: {
      cuenta_id,
      periodo,
      saldo_banco,
      saldo_sistema,
      diferencia,
    },
    include: { cuenta: { include: { banco: true } } },
  });

  return NextResponse.json(conciliacion, { status: 201 });
}
