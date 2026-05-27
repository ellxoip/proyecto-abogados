import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkMutationRole } from "@/server/auth/roles";
import { ContabilidadService } from "@/server/services/contabilidad/contabilidad.service";
import { PaymentApplicationService } from "@/server/services/integrations/payment-application.service";
import { EstadoComprobante, EstadoPago, TipoMovimientoContable, TipoMovimientoTesoreria } from "@prisma/client";

const PagoManualSchema = z.object({
  contrato_id: z.number().int().positive(),
  cuota_ids: z.array(z.number().int().positive()).min(1),
  monto: z.number().positive(),
  medio_pago: z.string().min(1),
  cuenta_bancaria_id: z.number().int().positive(),
  fecha_pago: z.string().min(1),
  referencia: z.string().optional(),
  observacion: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const { session, error: authError } = await checkMutationRole();
  if (authError) return authError;

  const parsed = PagoManualSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", detalles: parsed.error.flatten() }, { status: 400 });

  const { contrato_id, cuota_ids, monto, medio_pago, cuenta_bancaria_id, fecha_pago, referencia, observacion } = parsed.data;

  const fecha = new Date(fecha_pago);

  const [contrato, cuentaBancaria, cuotas] = await Promise.all([
    prisma.contrato.findUnique({ where: { id: contrato_id }, include: { cliente: { select: { id: true } } } }),
    prisma.cuentaBancaria.findUnique({ where: { id: cuenta_bancaria_id } }),
    prisma.cuota.findMany({ where: { id: { in: cuota_ids } } }),
  ]);

  if (!contrato) return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
  if (!cuentaBancaria || !cuentaBancaria.activa) return NextResponse.json({ error: "Cuenta bancaria no encontrada o inactiva" }, { status: 404 });
  if (cuotas.length !== cuota_ids.length) return NextResponse.json({ error: "Una o más cuotas no existen" }, { status: 404 });

  const cuotasInvalidas = cuotas.filter((c) => !["PENDIENTE", "PARCIAL", "VENCIDA"].includes(c.estado));
  if (cuotasInvalidas.length > 0) return NextResponse.json({ error: "Existen cuotas en estado no pagable" }, { status: 422 });
  if (cuotas.some((c) => c.contrato_id !== contrato_id)) return NextResponse.json({ error: "Cuotas no pertenecen al contrato" }, { status: 422 });

  const svc = new ContabilidadService(prisma);
  let ctx: Awaited<ReturnType<typeof svc.resolverContexto>>;
  try {
    ctx = await svc.resolverContexto(["1101", "1201"], "INGRESO", fecha);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }

  const glosa = observacion ?? `Pago manual contrato #${contrato_id}`;
  const paymentAppSvc = new PaymentApplicationService(prisma);

  const resultado = await prisma.$transaction(async (tx) => {
    const pago = await tx.pago.create({
      data: {
        cliente_id: contrato.cliente.id,
        contrato_id,
        fecha_pago: fecha,
        monto_pagado: monto,
        estado: EstadoPago.CONFIRMADO,
        medio_pago,
        referencia: referencia ?? null,
        observacion: glosa,
      },
    });

    await paymentAppSvc.aplicarPagoACuotas(pago.id, cuota_ids);

    await tx.movimientoTesoreria.create({
      data: {
        cuenta_id: cuenta_bancaria_id,
        tipo: TipoMovimientoTesoreria.INGRESO,
        descripcion: glosa,
        monto,
        fecha_movimiento: fecha,
        referencia: referencia ?? null,
        pago_id: pago.id,
      },
    });

    await tx.comprobanteContable.create({
      data: {
        tipo_id: ctx.tipo.id,
        numero: ctx.tipo.siguiente_numero,
        fecha_comprobante: fecha,
        descripcion: `Cobro manual #${pago.id} - ${glosa}`,
        estado: EstadoComprobante.APROBADO,
        total_debe: monto,
        total_haber: monto,
        usuario_id: Number(session.userId),
        partidas: {
          create: [
            { cuenta_id: ctx.cuentas.get("1101")!.id, tipo: TipoMovimientoContable.DEBE,  monto, glosa },
            { cuenta_id: ctx.cuentas.get("1201")!.id, tipo: TipoMovimientoContable.HABER, monto, glosa },
          ],
        },
      },
    });
    await tx.tipoComprobanteContable.update({
      where: { id: ctx.tipo.id },
      data: { siguiente_numero: { increment: 1 } },
    });

    return pago;
  });

  return NextResponse.json(resultado, { status: 201 });
}
