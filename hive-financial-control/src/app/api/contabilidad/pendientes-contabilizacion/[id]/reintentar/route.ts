import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkMutationRole } from "@/server/auth/roles";
import { EstadoComprobante, EstadoPago, IntegrationEventStatus, TipoMovimientoContable, TipoMovimientoTesoreria } from "@prisma/client";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await checkMutationRole();
  if (error) return error;

  const { id } = await params;
  const pagoId = Number(id);
  if (!Number.isFinite(pagoId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const pago = await prisma.pago.findUnique({
    where: { id: pagoId },
    include: { cliente: { select: { nombre: true } } },
  });
  if (!pago) return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
  if (pago.estado !== EstadoPago.CONFIRMADO) {
    return NextResponse.json({ error: "Solo pagos CONFIRMADO pueden ser reintentados" }, { status: 422 });
  }

  const yaContabilizado = await prisma.movimientoTesoreria.findFirst({
    where: { pago_id: pagoId },
  });
  if (yaContabilizado) {
    return NextResponse.json({ ok: true, message: "Pago ya contabilizado", movimiento_id: yaContabilizado.id });
  }

  const fecha = pago.fecha_pago;
  const monto = Math.abs(Number(pago.monto_pagado));
  const periodo = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;

  const [cuentaBancaria, cuentaDebe, cuentaHaber, tipoComp, cierre] = await Promise.all([
    prisma.cuentaBancaria.findFirst({ where: { cuenta_principal: true, activa: true } }),
    prisma.cuentaContable.findFirst({ where: { codigo: "1101" } }),
    prisma.cuentaContable.findFirst({ where: { codigo: "1201" } }),
    prisma.tipoComprobanteContable.findFirst({ where: { nombre: "INGRESO" } }),
    prisma.cierreContable.findFirst({
      where: {
        OR: [
          { tipo: "MENSUAL", periodo },
          { tipo: "ANUAL", periodo: String(fecha.getFullYear()) },
        ],
      },
    }),
  ]);

  if (!cuentaBancaria) return NextResponse.json({ error: "No existe cuenta bancaria principal activa" }, { status: 422 });
  if (!cuentaDebe || !cuentaHaber) return NextResponse.json({ error: "Cuentas contables 1101/1201 no configuradas" }, { status: 422 });
  if (!tipoComp) return NextResponse.json({ error: "Tipo comprobante INGRESO no configurado" }, { status: 422 });
  if (cierre) return NextResponse.json({ error: `Período ${periodo} cerrado, no se puede contabilizar` }, { status: 422 });

  const descripcion = `Cobro PagaCuotas - Pago #${pagoId} (reintento)`;

  const [movimiento, comprobante] = await prisma.$transaction([
    prisma.movimientoTesoreria.create({
      data: {
        cuenta_id: cuentaBancaria.id,
        tipo: TipoMovimientoTesoreria.INGRESO,
        descripcion,
        monto,
        fecha_movimiento: fecha,
        pago_id: pagoId,
      },
    }),
    prisma.comprobanteContable.create({
      data: {
        tipo_id: tipoComp.id,
        numero: tipoComp.siguiente_numero,
        fecha_comprobante: fecha,
        descripcion,
        estado: EstadoComprobante.APROBADO,
        total_debe: monto,
        total_haber: monto,
        usuario_id: Number(session.userId),
        partidas: {
          create: [
            { cuenta_id: cuentaDebe.id, tipo: TipoMovimientoContable.DEBE, monto },
            { cuenta_id: cuentaHaber.id, tipo: TipoMovimientoContable.HABER, monto },
          ],
        },
      },
    }),
    prisma.tipoComprobanteContable.update({
      where: { id: tipoComp.id },
      data: { siguiente_numero: { increment: 1 } },
    }),
  ]);

  await prisma.integrationEvent.updateMany({
    where: {
      event_type: "accounting.posting.failed",
      idempotency_key: { contains: `:pago:${pagoId}` },
      status: { in: [IntegrationEventStatus.PENDING, IntegrationEventStatus.FAILED] },
    },
    data: { status: IntegrationEventStatus.PROCESSED, processed_at: new Date() },
  }).catch(() => {});

  return NextResponse.json({ ok: true, movimiento_id: movimiento.id, comprobante_id: comprobante.id }, { status: 201 });
}
