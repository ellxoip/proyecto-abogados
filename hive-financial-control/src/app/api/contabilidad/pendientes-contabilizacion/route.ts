import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkMutationRole } from "@/server/auth/roles";
import { EstadoPago, IntegrationEventStatus } from "@prisma/client";

export async function GET() {
  const { error } = await checkMutationRole();
  if (error) return error;

  const [movimientoPagoIds, eventsFallidos] = await Promise.all([
    prisma.movimientoTesoreria.findMany({
      where: { pago_id: { not: null } },
      select: { pago_id: true },
    }),
    prisma.integrationEvent.findMany({
      where: {
        event_type: "accounting.posting.failed",
        status: { in: [IntegrationEventStatus.PENDING, IntegrationEventStatus.FAILED] },
      },
      orderBy: { created_at: "desc" },
      take: 200,
    }),
  ]);

  const pagoIdsContabilizados = new Set(
    movimientoPagoIds.map(m => m.pago_id).filter((id): id is number => id != null),
  );

  const pagosConfirmados = await prisma.pago.findMany({
    where: {
      estado: EstadoPago.CONFIRMADO,
      id: { notIn: pagoIdsContabilizados.size ? Array.from(pagoIdsContabilizados) : [0] },
    },
    include: {
      cliente: { select: { nombre: true, rut: true } },
      contrato: { select: { id: true, tipo_servicio: true } },
    },
    orderBy: { created_at: "desc" },
    take: 200,
  });

  const eventsByPago = new Map<number, (typeof eventsFallidos)[0][]>();
  for (const ev of eventsFallidos) {
    const payload = ev.payload as Record<string, unknown>;
    const pagoId = typeof payload.pago_id === "number" ? payload.pago_id : null;
    if (pagoId != null) {
      if (!eventsByPago.has(pagoId)) eventsByPago.set(pagoId, []);
      eventsByPago.get(pagoId)!.push(ev);
    }
  }

  const pendientes = pagosConfirmados.map(p => ({
    pago_id: p.id,
    fecha_pago: p.fecha_pago,
    monto: Number(p.monto_pagado),
    medio_pago: p.medio_pago,
    cliente: p.cliente,
    contrato: p.contrato,
    eventos_fallo: (eventsByPago.get(p.id) ?? []).map(ev => ({
      id: ev.id,
      error: ev.error_message,
      created_at: ev.created_at,
      payload: ev.payload,
    })),
    tiene_evento_fallo: (eventsByPago.get(p.id)?.length ?? 0) > 0,
  }));

  const pagoIdsEnPendientes = new Set(pendientes.map(p => p.pago_id));
  const eventosHuerfanos = eventsFallidos.filter(ev => {
    const payload = ev.payload as Record<string, unknown>;
    const pagoId = typeof payload.pago_id === "number" ? payload.pago_id : null;
    return pagoId == null || !pagoIdsEnPendientes.has(pagoId);
  });

  return NextResponse.json({
    pendientes,
    eventos_huerfanos: eventosHuerfanos.map(ev => ({
      id: ev.id,
      payload: ev.payload,
      error: ev.error_message,
      created_at: ev.created_at,
    })),
    summary: {
      pagos_sin_asiento: pendientes.length,
      eventos_fallo: eventsFallidos.length,
    },
  });
}
