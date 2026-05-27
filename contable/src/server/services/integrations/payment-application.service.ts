import { EstadoContrato, EstadoCuota, Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applyPaymentToInstallments, roundMoney } from "../financial.utils";

type DbLike = PrismaClient;

function resolveEstadoCuota(
  saldoPendiente: number,
  montoActual: number,
  fechaVencimiento: Date,
  now: Date,
): EstadoCuota {
  if (saldoPendiente <= 0) return EstadoCuota.PAGADA;
  if (saldoPendiente < montoActual) return EstadoCuota.PARCIAL;
  return fechaVencimiento < now ? EstadoCuota.VENCIDA : EstadoCuota.PENDIENTE;
}

export class PaymentApplicationService {
  constructor(private readonly db: DbLike = prisma) {}

  async aplicarPagoACuotas(pagoId: number, cuotaIds: number[]) {
    return this.db.$transaction(async (tx) => {
      const pago = await tx.pago.findUnique({ where: { id: pagoId } });
      if (!pago) throw new Error("Pago no encontrado.");

      const cuotas = await tx.cuota.findMany({
        where: {
          id: { in: cuotaIds.length > 0 ? cuotaIds : [-1] },
          contrato_id: pago.contrato_id,
        },
        orderBy: [{ fecha_vencimiento: "asc" }, { numero_cuota: "asc" }],
      });

      const allocations = applyPaymentToInstallments(
        cuotas.map((cuota) => ({
          id: cuota.id,
          fechaVencimiento: cuota.fecha_vencimiento,
          saldoPendiente: Number(cuota.saldo_pendiente),
          montoPagado: Number(cuota.monto_pagado),
        })),
        Number(pago.monto_pagado),
        pago.fecha_pago,
      );

      for (const item of allocations.allocations) {
        await tx.aplicacionPago.upsert({
          where: {
            pago_id_cuota_id: {
              pago_id: pago.id,
              cuota_id: item.cuotaId,
            },
          },
          update: { monto_aplicado: item.montoAplicado },
          create: {
            pago_id: pago.id,
            cuota_id: item.cuotaId,
            monto_aplicado: item.montoAplicado,
          },
        });
        await this.recalcularCuota(item.cuotaId, tx);
      }

      if (allocations.allocations.length > 0 && !pago.cuota_id) {
        await tx.pago.update({
          where: { id: pago.id },
          data: { cuota_id: allocations.allocations[0].cuotaId },
        });
      }

      await this.recalcularContrato(pago.contrato_id, tx);

      return {
        pagoId: pago.id,
        contratoId: pago.contrato_id,
        cuotasAplicadas: allocations.allocations.length,
        abonoNoAplicado: allocations.abonoNoAplicado,
      };
    });
  }

  async recalcularCuota(cuotaId: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.db;
    const cuota = await db.cuota.findUnique({
      where: { id: cuotaId },
      include: { aplicaciones_pago: true },
    });
    if (!cuota) throw new Error("Cuota no encontrada.");

    const montoAplicado = roundMoney(
      cuota.aplicaciones_pago.reduce(
        (acc, aplicacion) => acc + Number(aplicacion.monto_aplicado),
        0,
      ),
    );

    const saldo = roundMoney(Math.max(Number(cuota.monto_actual) - montoAplicado, 0));
    const estado = resolveEstadoCuota(
      saldo,
      Number(cuota.monto_actual),
      cuota.fecha_vencimiento,
      new Date(),
    );

    return db.cuota.update({
      where: { id: cuotaId },
      data: {
        monto_pagado: montoAplicado,
        saldo_pendiente: saldo,
        estado,
        fecha_pago: saldo === 0 ? new Date() : null,
      },
    });
  }

  async recalcularContrato(contratoId: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.db;
    const cuotas = await db.cuota.findMany({
      where: { contrato_id: contratoId },
      select: { saldo_pendiente: true, fecha_vencimiento: true },
    });

    const now = new Date();
    const hasSaldo = cuotas.some((cuota) => Number(cuota.saldo_pendiente) > 0);
    const hasVencidas = cuotas.some(
      (cuota) =>
        Number(cuota.saldo_pendiente) > 0 && cuota.fecha_vencimiento < now,
    );
    const estado = !hasSaldo
      ? EstadoContrato.PAGADO
      : hasVencidas
        ? EstadoContrato.EN_MORA
        : EstadoContrato.ACTIVO;

    return db.contrato.update({
      where: { id: contratoId },
      data: { estado },
    });
  }
}
