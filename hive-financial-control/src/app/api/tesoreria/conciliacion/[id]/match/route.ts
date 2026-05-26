import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkMutationRole } from "@/server/auth/roles";

const MAX_DIAS_DIFERENCIA = 2;
const MS_POR_DIA = 86400000;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await checkMutationRole();
  if (error) return error;

  const { id } = await params;
  const conc = await prisma.conciliacionBancaria.findUnique({
    where: { id: Number(id) },
    include: { cuenta: true },
  });
  if (!conc) return NextResponse.json({ error: "Conciliación no encontrada" }, { status: 404 });

  // Items de banco no conciliados
  const itemsBanco = await prisma.itemConciliacion.findMany({
    where: { conciliacion_id: Number(id), conciliado: false },
    orderBy: { fecha_movimiento: "asc" },
  });

  // Movimientos sistema no conciliados para la cuenta
  const movsSistema = await prisma.movimientoTesoreria.findMany({
    where: { cuenta_id: conc.cuenta_id, conciliado: false },
    orderBy: { fecha_movimiento: "asc" },
  });

  const usedMovIds = new Set<number>();
  const matches: { item_id: number; movimiento_id: number }[] = [];

  for (const item of itemsBanco) {
    const montoItem = Number(item.cargo ?? item.abono ?? 0);
    if (montoItem === 0) continue;
    const tipoEsperado = item.cargo ? "EGRESO" : "INGRESO";

    const match = movsSistema.find((m) => {
      if (usedMovIds.has(m.id)) return false;
      if (m.tipo !== tipoEsperado) return false;
      if (Number(m.monto) !== montoItem) return false;
      const diffMs = Math.abs(m.fecha_movimiento.getTime() - item.fecha_movimiento.getTime());
      return diffMs <= MAX_DIAS_DIFERENCIA * MS_POR_DIA;
    });

    if (match) {
      matches.push({ item_id: item.id, movimiento_id: match.id });
      usedMovIds.add(match.id);
    }
  }

  // Apply matches in a transaction
  if (matches.length > 0) {
    await prisma.$transaction(
      matches.flatMap(({ item_id, movimiento_id }) => [
        prisma.itemConciliacion.update({
          where: { id: item_id },
          data: { conciliado: true, movimiento_sistema_id: movimiento_id },
        }),
        prisma.movimientoTesoreria.update({
          where: { id: movimiento_id },
          data: { conciliado: true },
        }),
      ]),
    );
  }

  // Recalculate summary
  const allItems = await prisma.itemConciliacion.findMany({
    where: { conciliacion_id: Number(id) },
    select: { conciliado: true },
  });
  const pendientesSistema = await prisma.movimientoTesoreria.count({
    where: { cuenta_id: conc.cuenta_id, conciliado: false },
  });

  return NextResponse.json({
    matches_realizados: matches.length,
    resumen: {
      total_items: allItems.length,
      conciliados: allItems.filter((i) => i.conciliado).length,
      pendientes_banco: allItems.filter((i) => !i.conciliado).length,
      pendientes_sistema: pendientesSistema,
    },
  });
}
