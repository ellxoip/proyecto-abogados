import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const conc = await prisma.conciliacionBancaria.findUnique({
    where: { id: Number(id) },
    include: {
      cuenta: { include: { banco: true } },
      items: { orderBy: { fecha_movimiento: "asc" } },
    },
  });
  if (!conc) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const conciliados = conc.items.filter((i) => i.conciliado);
  const pendientesBanco = conc.items.filter((i) => !i.conciliado);

  // movimientos sistema sin conciliar en el período para la cuenta
  const [year, month] = conc.periodo.split("-").map(Number);
  const fechaDesde = new Date(year, month - 1, 1);
  const fechaHasta = new Date(year, month, 0);

  const movsSistema = await prisma.movimientoTesoreria.findMany({
    where: {
      cuenta_id: conc.cuenta_id,
      conciliado: false,
      fecha_movimiento: { gte: fechaDesde, lte: fechaHasta },
    },
    orderBy: { fecha_movimiento: "asc" },
  });

  return NextResponse.json({
    ...conc,
    resumen: {
      total_items: conc.items.length,
      conciliados: conciliados.length,
      pendientes_banco: pendientesBanco.length,
      pendientes_sistema: movsSistema.length,
    },
    pendientes_sistema: movsSistema,
  });
}
