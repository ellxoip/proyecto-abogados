import { TipoCliente } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAtInformaPlanPagos, PlanPagosFilters } from "./client";
import { mapAtInformaContratoEstado, mapAtInformaCuotaEstado } from "./mappers";

export type SyncAtInformaResult = {
  success: true;
  planesProcesados: number;
  clientesUpserted: number;
  contratosUpserted: number;
  cuotasUpserted: number;
};

function toDateOrNow(value?: string | null) {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export async function syncAtInformaPlanPagos(
  filters: PlanPagosFilters = {},
): Promise<SyncAtInformaResult> {
  const atInformaSystem = await prisma.sistemaExterno.upsert({
    where: { codigo: "AT_INFORMA" },
    update: {},
    create: {
      codigo: "AT_INFORMA",
      nombre: "AT Informa",
      base_url: process.env.AT_INFORMA_API_URL ?? null,
      activo: true,
    },
  });

  try {
    const response = await getAtInformaPlanPagos(filters);

    let clientesUpserted = 0;
    let contratosUpserted = 0;
    let cuotasUpserted = 0;

    for (const plan of response.planes) {
      const existingByRut = await prisma.cliente.findUnique({
        where: { rut: plan.cliente.rut },
      });

      const cliente = existingByRut
        ? await prisma.cliente.update({
            where: { id: existingByRut.id },
            data: {
              nombre: plan.cliente.nombre,
              email: plan.cliente.email ?? null,
              telefono: plan.cliente.telefono ?? null,
            },
          })
        : await prisma.cliente.upsert({
            where: { rut: plan.cliente.rut },
            update: {
              nombre: plan.cliente.nombre,
              email: plan.cliente.email ?? null,
              telefono: plan.cliente.telefono ?? null,
            },
            create: {
              rut: plan.cliente.rut,
              nombre: plan.cliente.nombre,
              tipo_cliente: TipoCliente.PERSONA,
              email: plan.cliente.email ?? null,
              telefono: plan.cliente.telefono ?? null,
              fecha_ingreso: new Date(),
            },
          });
      clientesUpserted += 1;

      const contrato = await prisma.contrato.upsert({
        where: { external_id: plan.caso.id },
        update: {
          cliente_id: cliente.id,
          tipo_servicio: plan.caso.categoria ?? "SERVICIO",
          monto_ccto: plan.contrato.ccto,
          monto_pago_inicial: plan.contrato.pago_inicial,
          saldo_financiado: plan.contrato.saldo_financiado,
          cantidad_cuotas_original: plan.contrato.cantidad_cuotas,
          observaciones: plan.caso.boleta_inicial ?? null,
          estado: mapAtInformaContratoEstado({
            saldoPendiente: plan.contrato.saldo_pendiente,
            saldoVencido: plan.contrato.saldo_vencido,
          }),
        },
        create: {
          external_id: plan.caso.id,
          cliente_id: cliente.id,
          tipo_servicio: plan.caso.categoria ?? "SERVICIO",
          fecha_contrato: new Date(),
          monto_ccto: plan.contrato.ccto,
          monto_pago_inicial: plan.contrato.pago_inicial,
          saldo_financiado: plan.contrato.saldo_financiado,
          cantidad_cuotas_original: plan.contrato.cantidad_cuotas,
          observaciones: plan.caso.boleta_inicial ?? null,
          estado: mapAtInformaContratoEstado({
            saldoPendiente: plan.contrato.saldo_pendiente,
            saldoVencido: plan.contrato.saldo_vencido,
          }),
        },
      });
      contratosUpserted += 1;

      for (const cuota of plan.cuotas) {
        const current = await prisma.cuota.findUnique({
          where: {
            contrato_id_numero_cuota: {
              contrato_id: contrato.id,
              numero_cuota: cuota.numero_cuota,
            },
          },
        });

        const estadoMapeado = mapAtInformaCuotaEstado(cuota.estado, current?.estado);

        if (current) {
          await prisma.cuota.update({
            where: { id: current.id },
            data: {
              contrato_id: contrato.id,
              numero_cuota: cuota.numero_cuota,
              fecha_vencimiento: toDateOrNow(cuota.fecha_vencimiento),
              monto_original: cuota.monto,
              monto_actual: cuota.monto,
              monto_pagado: cuota.monto_pagado,
              saldo_pendiente: cuota.saldo_pendiente,
              estado: estadoMapeado,
              fecha_pago: cuota.pagado_en ? toDateOrNow(cuota.pagado_en) : null,
            },
          });
        } else {
          await prisma.cuota.create({
            data: {
              contrato_id: contrato.id,
              numero_cuota: cuota.numero_cuota,
              fecha_vencimiento: toDateOrNow(cuota.fecha_vencimiento),
              monto_original: cuota.monto,
              monto_actual: cuota.monto,
              monto_pagado: cuota.monto_pagado,
              saldo_pendiente: cuota.saldo_pendiente,
              estado: estadoMapeado,
              fecha_pago: cuota.pagado_en ? toDateOrNow(cuota.pagado_en) : null,
            },
          });
        }

        cuotasUpserted += 1;
      }
    }

    await prisma.externalSyncLog.create({
      data: {
        sistema_externo_id: atInformaSystem.id,
        sync_type: "AT_INFORMA_PLAN_PAGOS",
        status: "SUCCESS",
        response_summary: { total_registros: response.planes.length },
      },
    });

    return {
      success: true,
      planesProcesados: response.planes.length,
      clientesUpserted,
      contratosUpserted,
      cuotasUpserted,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error de sincronización";

    await prisma.externalSyncLog.create({
      data: {
        sistema_externo_id: atInformaSystem.id,
        sync_type: "AT_INFORMA_PLAN_PAGOS",
        status: "FAILED",
        error_message: message,
      },
    });

    throw new Error(message);
  }
}
