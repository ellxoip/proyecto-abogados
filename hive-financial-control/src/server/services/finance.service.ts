import {
  EstadoContrato,
  EstadoCuota,
  PrismaClient,
  TipoModificacion,
  TipoCliente,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ExternalContractPayload,
  InstallmentInput,
  PaymentResult,
} from "./financial.types";
import { externalContractSchema } from "../schemas/external-contract.schema";
import { notifyAtInformaPago } from "@/server/integrations/at-informa/client";
import {
  applyPaymentToInstallments,
  buildRepactationPlan,
  calculateContractState,
  generateInstallmentPlan,
  roundMoney,
  selectInstallmentsToReplaceForRepactation,
} from "./financial.utils";

type DbClient = PrismaClient | typeof prisma;

type TxLike = {
  cuota: DbClient["cuota"];
  contrato: DbClient["contrato"];
};

async function persistStatuses(
  tx: TxLike,
  contratoId: number,
): Promise<EstadoContrato> {
  const cuotas = await tx.cuota.findMany({
    where: { contrato_id: contratoId },
    orderBy: { numero_cuota: "asc" },
  });

  const now = new Date();

  for (const cuota of cuotas) {
    if (
      cuota.estado === EstadoCuota.REEMPLAZADA ||
      cuota.estado === EstadoCuota.ANULADA ||
      cuota.estado === EstadoCuota.CONDONADA
    ) {
      continue;
    }

    const saldo = Number(cuota.saldo_pendiente);
    let estado = cuota.estado;

    if (saldo <= 0) {
      estado = EstadoCuota.PAGADA;
    } else if (saldo < Number(cuota.monto_actual)) {
      estado = EstadoCuota.PARCIAL;
    } else if (cuota.fecha_vencimiento < now) {
      estado = EstadoCuota.VENCIDA;
    } else {
      estado = EstadoCuota.PENDIENTE;
    }

    if (estado !== cuota.estado) {
      await tx.cuota.update({
        where: { id: cuota.id },
        data: { estado },
      });
    }
  }

  const fresh = await tx.cuota.findMany({
    where: { contrato_id: contratoId },
    select: { saldo_pendiente: true, fecha_vencimiento: true },
  });

  const estadoContrato = calculateContractState(
    fresh.map((item) => ({
      saldoPendiente: Number(item.saldo_pendiente),
      fechaVencimiento: item.fecha_vencimiento,
    })),
    now,
  );

  await tx.contrato.update({
    where: { id: contratoId },
    data: { estado: estadoContrato },
  });

  return estadoContrato;
}

export async function reprogramInstallmentDate(
  input: {
    cuotaId: number;
    nuevaFechaVencimiento: Date;
    motivo: string;
    usuarioId: number;
    aprobadoPor?: number;
  },
  db: DbClient = prisma,
) {
  return db.$transaction(async (tx) => {
    const cuota = await tx.cuota.findUnique({
      where: { id: input.cuotaId },
      include: { contrato: true },
    });

    if (!cuota) {
      throw new Error("La cuota no existe.");
    }

    const anterior = cuota.fecha_vencimiento;

    await tx.cuota.update({
      where: { id: cuota.id },
      data: {
        fecha_vencimiento: input.nuevaFechaVencimiento,
      },
    });

    await tx.modificacionContrato.create({
      data: {
        contrato_id: cuota.contrato_id,
        cuota_id: cuota.id,
        usuario_id: input.usuarioId,
        aprobado_por: input.aprobadoPor,
        tipo_modificacion: TipoModificacion.CAMBIO_FECHA,
        fecha_modificacion: new Date(),
        valor_anterior: {
          fecha_vencimiento: anterior.toISOString().slice(0, 10),
        },
        valor_nuevo: {
          fecha_vencimiento: input.nuevaFechaVencimiento.toISOString().slice(0, 10),
        },
        motivo: input.motivo,
      },
    });

    await persistStatuses(tx, cuota.contrato_id);

    return {
      cuota_id: cuota.id,
      contrato_id: cuota.contrato_id,
      fecha_anterior: anterior,
      fecha_nueva: input.nuevaFechaVencimiento,
    };
  });
}

export async function repactContract(
  input: {
    contratoId: number;
    nuevaCantidadCuotas: number;
    fechaPrimeraCuota: Date;
    motivo: string;
    usuarioId: number;
    aprobadoPor?: number;
  },
  db: DbClient = prisma,
) {
  if (input.nuevaCantidadCuotas <= 0) {
    throw new Error("La nueva cantidad de cuotas debe ser mayor a cero.");
  }

  return db.$transaction(async (tx) => {
    const contrato = await tx.contrato.findUnique({
      where: { id: input.contratoId },
      include: {
        cuotas: {
          orderBy: { numero_cuota: "asc" },
        },
      },
    });

    if (!contrato) {
      throw new Error("El contrato no existe.");
    }

    const cuotasAReemplazar = selectInstallmentsToReplaceForRepactation(
      contrato.cuotas.map((cuota) => ({
        id: cuota.id,
        fechaVencimiento: cuota.fecha_vencimiento,
        saldoPendiente: Number(cuota.saldo_pendiente),
        estado: cuota.estado,
      })),
      new Date(),
    );

    if (cuotasAReemplazar.length === 0) {
      throw new Error("No hay cuotas futuras pendientes para repactar.");
    }

    const saldoRepactado = roundMoney(
      cuotasAReemplazar.reduce(
        (acc, cuota) => acc + Number(cuota.saldoPendiente),
        0,
      ),
    );

    await tx.cuota.updateMany({
      where: {
        id: { in: cuotasAReemplazar.map((cuota) => cuota.id) },
      },
      data: {
        estado: EstadoCuota.REEMPLAZADA,
      },
    });

    const maxNumeroActual = contrato.cuotas.reduce(
      (max, cuota) => Math.max(max, cuota.numero_cuota),
      0,
    );

    const nuevasCuotas = buildRepactationPlan(
      saldoRepactado,
      input.nuevaCantidadCuotas,
      input.fechaPrimeraCuota,
      maxNumeroActual,
    ).map((cuota) => ({
      ...cuota,
      contrato_id: contrato.id,
    }));

    await tx.cuota.createMany({
      data: nuevasCuotas,
    });

    await tx.contrato.update({
      where: { id: contrato.id },
      data: {
        estado: EstadoContrato.REPACTADO,
      },
    });

    await tx.modificacionContrato.create({
      data: {
        contrato_id: contrato.id,
        usuario_id: input.usuarioId,
        aprobado_por: input.aprobadoPor,
        tipo_modificacion: TipoModificacion.REPACTACION,
        fecha_modificacion: new Date(),
        valor_anterior: {
          cuotas_reemplazadas_ids: cuotasAReemplazar.map((cuota) => cuota.id),
          cantidad_cuotas_reemplazadas: cuotasAReemplazar.length,
          saldo_repactado: saldoRepactado,
        },
        valor_nuevo: {
          nueva_cantidad_cuotas: input.nuevaCantidadCuotas,
          fecha_primera_cuota: input.fechaPrimeraCuota.toISOString().slice(0, 10),
          cuotas_creadas: nuevasCuotas.length,
        },
        motivo: input.motivo,
      },
    });

    return {
      contrato_id: contrato.id,
      saldo_repactado: saldoRepactado,
      cuotas_reemplazadas: cuotasAReemplazar.length,
      cuotas_nuevas: nuevasCuotas.length,
    };
  });
}

export async function createContractFromExternalPayload(
  payload: ExternalContractPayload,
  db: DbClient = prisma,
) {
  const parsed = externalContractSchema.parse(payload);

  return db.$transaction(async (tx) => {
    const cliente = await tx.cliente.upsert({
      where: { rut: parsed.rut },
      update: {
        nombre: parsed.nombre,
        telefono: parsed.telefono,
        email: parsed.email,
        fecha_ingreso: new Date(parsed.fecha_ingreso),
      },
      create: {
        rut: parsed.rut,
        nombre: parsed.nombre,
        telefono: parsed.telefono,
        email: parsed.email,
        fecha_ingreso: new Date(parsed.fecha_ingreso),
        tipo_cliente: TipoCliente.PERSONA,
      },
    });

    const saldoFinanciado = roundMoney(parsed.ccto - parsed.pago_inicial);
    const cuotas = generateInstallmentPlan(
      saldoFinanciado,
      parsed.cantidad_cuotas,
      new Date(parsed.fecha_primera_cuota),
    );

    const contrato = await tx.contrato.create({
      data: {
        cliente_id: cliente.id,
        external_id: parsed.external_id,
        tipo_servicio: parsed.tipo_servicio,
        fecha_contrato: new Date(parsed.fecha_ingreso),
        monto_ccto: parsed.ccto,
        monto_pago_inicial: parsed.pago_inicial,
        saldo_financiado: saldoFinanciado,
        cantidad_cuotas_original: parsed.cantidad_cuotas,
        cuotas: { create: cuotas },
      },
      include: { cuotas: true },
    });

    if (parsed.pago_inicial > 0) {
      await tx.pago.create({
        data: {
          cliente_id: cliente.id,
          contrato_id: contrato.id,
          fecha_pago: new Date(parsed.fecha_ingreso),
          monto_pagado: parsed.pago_inicial,
          medio_pago: "transferencia",
          referencia: "PAGO-INICIAL",
          observacion: "Pago inicial de contrato",
        },
      });
    }

    return {
      status: "created" as const,
      cliente_id: cliente.id,
      contrato_id: contrato.id,
      cuotas_creadas: contrato.cuotas.length,
    };
  });
}

export async function updateInstallmentsAndContractStatus(
  contratoId: number,
  db: DbClient = prisma,
) {
  return db.$transaction(async (tx) => persistStatuses(tx, contratoId));
}

export async function registerPayment(
  input: {
    clienteId: number;
    contratoId: number;
    montoPagado: number;
    fechaPago: Date;
    medioPago: string;
    referencia?: string;
    observacion?: string;
  },
  db: DbClient = prisma,
): Promise<PaymentResult> {
  const txResult = await db.$transaction(async (tx) => {
    const cuotas = await tx.cuota.findMany({
      where: {
        contrato_id: input.contratoId,
        estado: {
          in: [EstadoCuota.VENCIDA, EstadoCuota.PENDIENTE, EstadoCuota.PARCIAL],
        },
      },
      orderBy: [{ fecha_vencimiento: "asc" }, { numero_cuota: "asc" }],
    });

    const allocatable: InstallmentInput[] = cuotas.map((cuota) => ({
      id: cuota.id,
      fechaVencimiento: cuota.fecha_vencimiento,
      saldoPendiente: Number(cuota.saldo_pendiente),
      montoPagado: Number(cuota.monto_pagado),
    }));

    const { allocations, abonoNoAplicado } = applyPaymentToInstallments(
      allocatable,
      input.montoPagado,
      input.fechaPago,
    );

    const notificationCandidates: Array<{
      cuotaId: number;
      montoAplicado: number;
    }> = [];

    for (const apply of allocations) {
      const cuota = cuotas.find((item) => item.id === apply.cuotaId);
      if (!cuota) continue;

      const nuevoMontoPagado = roundMoney(
        Number(cuota.monto_pagado) + apply.montoAplicado,
      );

      await tx.cuota.update({
        where: { id: apply.cuotaId },
        data: {
          monto_pagado: nuevoMontoPagado,
          saldo_pendiente: apply.saldoRestanteCuota,
          estado: apply.estadoCuota,
          fecha_pago: apply.saldoRestanteCuota === 0 ? input.fechaPago : null,
        },
      });

      await tx.pago.create({
        data: {
          cliente_id: input.clienteId,
          contrato_id: input.contratoId,
          cuota_id: apply.cuotaId,
          fecha_pago: input.fechaPago,
          monto_pagado: apply.montoAplicado,
          medio_pago: input.medioPago,
          referencia: input.referencia,
          observacion: input.observacion,
        },
      });

      notificationCandidates.push({
        cuotaId: apply.cuotaId,
        montoAplicado: apply.montoAplicado,
      });
    }

    if (abonoNoAplicado > 0) {
      await tx.pago.create({
        data: {
          cliente_id: input.clienteId,
          contrato_id: input.contratoId,
          fecha_pago: input.fechaPago,
          monto_pagado: abonoNoAplicado,
          medio_pago: input.medioPago,
          referencia: input.referencia,
          observacion: "Abono sin cuota asignada",
        },
      });
    }

    const estadoContrato = await persistStatuses(tx, input.contratoId);

    return {
      totalPagado: input.montoPagado,
      aplicado: allocations,
      abonoNoAplicado,
      estadoContrato,
      notificationCandidates,
    };
  });

  for (const candidate of txResult.notificationCandidates) {
    try {
      const cuota = await prisma.cuota.findUnique({
        where: { id: candidate.cuotaId },
        include: { contrato: true },
      });
      if (!cuota) continue;
      if (!cuota.contrato.external_id) continue;

      await notifyAtInformaPago({
        caso_id: cuota.contrato.external_id,
        payment_event_id: `cuota-${cuota.id}`,
        numero_cuota: cuota.numero_cuota,
        estado: "PAID",
        monto: Number(cuota.monto_actual),
        monto_pagado: candidate.montoAplicado,
        fecha_pago: input.fechaPago.toISOString(),
        comprobante: null,
        referencia: String(input.referencia ?? `pago-local-${cuota.id}-${Date.now()}`),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido notificando pago a AT-INFORMA";
      const system = await prisma.sistemaExterno.upsert({
        where: { codigo: "AT_INFORMA" },
        update: {},
        create: {
          codigo: "AT_INFORMA",
          nombre: "AT Informa",
          activo: true,
          base_url: process.env.AT_INFORMA_API_URL ?? null,
        },
      });

      await prisma.externalSyncLog.create({
        data: {
          sistema_externo_id: system.id,
          sync_type: "AT_INFORMA_PAGO_POST",
          status: "FAILED",
          error_message: message,
        },
      });
    }
  }

  return {
    totalPagado: txResult.totalPagado,
    aplicado: txResult.aplicado,
    abonoNoAplicado: txResult.abonoNoAplicado,
    estadoContrato: txResult.estadoContrato,
  };
}
