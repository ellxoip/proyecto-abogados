import {
  EstadoCuota,
  ExternalEntityType,
  ExternalSyncStatus,
  Prisma,
  type PrismaClient,
  TipoCliente,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AtInformaClient } from "./at-informa.client";
import { EXTERNAL_SYSTEM_CODES } from "./integration.constants";
import { ExternalReferenceService } from "./external-reference.service";
import { PaymentApplicationService } from "./payment-application.service";
import { pickDate, pickNumber, pickString, toMoney } from "./payload.utils";

type DbLike = PrismaClient;

type SyncOptions = {
  soloPendientes?: boolean;
  desde?: string;
  hasta?: string;
};

function mapEstadoCuota(raw: string | undefined, fechaVencimiento: Date, saldo: number): EstadoCuota {
  if (saldo <= 0) return EstadoCuota.PAGADA;
  const normalized = raw?.toLowerCase();
  if (normalized?.includes("venc")) return EstadoCuota.VENCIDA;
  if (normalized?.includes("parc")) return EstadoCuota.PARCIAL;
  if (normalized?.includes("anul")) return EstadoCuota.ANULADA;
  return fechaVencimiento < new Date() ? EstadoCuota.VENCIDA : EstadoCuota.PENDIENTE;
}

export class AtInformaSyncService {
  private readonly externalReferenceService: ExternalReferenceService;
  private readonly paymentApplicationService: PaymentApplicationService;

  constructor(
    private readonly db: DbLike = prisma,
    private readonly atInformaClient = new AtInformaClient(),
  ) {
    this.externalReferenceService = new ExternalReferenceService(db);
    this.paymentApplicationService = new PaymentApplicationService(db);
  }

  async syncClientes() {
    const rows = await this.atInformaClient.getClientes();
    let synced = 0;

    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const item = row as Record<string, unknown>;
      const externalId =
        pickString(item, ["cliente_id", "id", "external_id", "identifier"]) ??
        `ATC-${synced + 1}`;
      const rut = pickString(item, ["rut", "identifier"]) ?? `AT-${externalId}`;
      const nombre = pickString(item, ["nombre", "name"]) ?? `Cliente ${externalId}`;
      const fechaIngreso = pickDate(item, ["fecha_ingreso", "created_at"]) ?? new Date();

      const cliente = await this.db.cliente.upsert({
        where: { rut },
        update: {
          nombre,
          telefono: pickString(item, ["telefono", "phone"]),
          email: pickString(item, ["email"]),
          fecha_ingreso: fechaIngreso,
        },
        create: {
          rut,
          nombre,
          tipo_cliente: TipoCliente.PERSONA,
          telefono: pickString(item, ["telefono", "phone"]),
          email: pickString(item, ["email"]),
          fecha_ingreso: fechaIngreso,
        },
      });

      await this.externalReferenceService.upsertReference({
        systemCode: EXTERNAL_SYSTEM_CODES.AT_INFORMA,
        entityType: ExternalEntityType.CLIENTE,
        entityId: cliente.id,
        externalId,
        metadata: item as Prisma.InputJsonValue,
      });

      synced += 1;
    }

    return { synced };
  }

  async syncPlanPagos(options: { soloPendientes?: boolean } = {}) {
    const rows = await this.atInformaClient.getPlanPagos({
      soloPendientes: options.soloPendientes,
    });
    let synced = 0;

    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const item = row as Record<string, unknown>;

      const externalClienteId = pickString(item, ["cliente_id", "id_cliente", "rut"]);
      if (!externalClienteId) continue;

      const clienteRef = await this.externalReferenceService.findByExternalId(
        EXTERNAL_SYSTEM_CODES.AT_INFORMA,
        ExternalEntityType.CLIENTE,
        externalClienteId,
      );
      if (!clienteRef) continue;

      const contratoExternalId =
        pickString(item, ["contrato_id", "plan_id", "id_contrato"]) ??
        `${externalClienteId}-CONTRATO`;

      let contratoId: number;
      const contratoRef = await this.externalReferenceService.findByExternalId(
        EXTERNAL_SYSTEM_CODES.AT_INFORMA,
        ExternalEntityType.CONTRATO,
        contratoExternalId,
      );

      if (contratoRef) {
        contratoId = contratoRef.entity_id;
      } else {
        const montoTotal = toMoney(
          pickNumber(item, ["monto_total", "monto_contrato", "saldo_financiado"]),
          0,
        );
        const contrato = await this.db.contrato.create({
          data: {
            cliente_id: clienteRef.entity_id,
            tipo_servicio:
              pickString(item, ["tipo_servicio", "servicio", "producto"]) ??
              "Servicio legal",
            fecha_contrato: pickDate(item, ["fecha_contrato", "fecha_inicio"]) ?? new Date(),
            monto_ccto: montoTotal,
            monto_pago_inicial: 0,
            saldo_financiado: montoTotal,
            cantidad_cuotas_original: Math.max(
              1,
              pickNumber(item, ["cantidad_cuotas", "cuotas_totales"]) ?? 1,
            ),
          },
        });
        contratoId = contrato.id;
        await this.externalReferenceService.upsertReference({
          systemCode: EXTERNAL_SYSTEM_CODES.AT_INFORMA,
          entityType: ExternalEntityType.CONTRATO,
          entityId: contrato.id,
          externalId: contratoExternalId,
          metadata: item as Prisma.InputJsonValue,
        });
      }

      let casoLegalId: number | undefined;
      const casoExternalId = pickString(item, ["caso_id", "id_caso"]);
      if (casoExternalId) {
        const casoRef = await this.externalReferenceService.findByExternalId(
          EXTERNAL_SYSTEM_CODES.AT_INFORMA,
          ExternalEntityType.CASO_LEGAL,
          casoExternalId,
        );

        if (casoRef) {
          casoLegalId = casoRef.entity_id;
        } else {
          const caso = await this.db.casoLegal.create({
            data: {
              cliente_id: clienteRef.entity_id,
              contrato_id: contratoId,
              codigo_interno: pickString(item, ["codigo_caso"]),
              titulo: pickString(item, ["caso_nombre", "caso", "asunto"]) ?? `Caso ${casoExternalId}`,
              estado: pickString(item, ["estado_caso"]) ?? "ABIERTO",
              fecha_apertura: pickDate(item, ["fecha_apertura", "fecha_contrato"]) ?? new Date(),
            },
          });
          casoLegalId = caso.id;
          await this.externalReferenceService.upsertReference({
            systemCode: EXTERNAL_SYSTEM_CODES.AT_INFORMA,
            entityType: ExternalEntityType.CASO_LEGAL,
            entityId: caso.id,
            externalId: casoExternalId,
            metadata: item as Prisma.InputJsonValue,
          });
        }
      }

      const numeroCuota = Math.max(1, pickNumber(item, ["numero_cuota", "cuota_numero"]) ?? 1);
      const fechaVencimiento =
        pickDate(item, ["fecha_vencimiento", "vencimiento", "due_date"]) ?? new Date();
      const montoActual = toMoney(
        pickNumber(item, ["monto_cuota", "monto", "monto_actual"]),
        0,
      );
      const saldoPendiente = toMoney(
        pickNumber(item, ["saldo_pendiente", "pendiente"]),
        montoActual,
      );
      const estado = mapEstadoCuota(
        pickString(item, ["estado"]),
        fechaVencimiento,
        saldoPendiente,
      );

      const cuota = await this.db.cuota.upsert({
        where: {
          contrato_id_numero_cuota: {
            contrato_id: contratoId,
            numero_cuota: numeroCuota,
          },
        },
        update: {
          caso_legal_id: casoLegalId,
          fecha_vencimiento: fechaVencimiento,
          monto_actual: montoActual,
          saldo_pendiente: saldoPendiente,
          estado,
        },
        create: {
          contrato_id: contratoId,
          caso_legal_id: casoLegalId,
          numero_cuota: numeroCuota,
          fecha_vencimiento: fechaVencimiento,
          monto_original: montoActual,
          monto_actual: montoActual,
          saldo_pendiente: saldoPendiente,
          estado,
        },
      });

      const cuotaExternalId =
        pickString(item, ["cuota_id", "id_cuota"]) ??
        `${contratoExternalId}-${numeroCuota}`;
      await this.externalReferenceService.upsertReference({
        systemCode: EXTERNAL_SYSTEM_CODES.AT_INFORMA,
        entityType: ExternalEntityType.CUOTA,
        entityId: cuota.id,
        externalId: cuotaExternalId,
        metadata: item as Prisma.InputJsonValue,
      });

      synced += 1;
    }

    return { synced };
  }

  async syncCobranza(options?: { desde?: Date; hasta?: Date }) {
    const rows = await this.atInformaClient.getCobranza();
    let synced = 0;
    let skipped = 0;

    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const item = row as Record<string, unknown>;

      const fechaPago = pickDate(item, ["fecha_pago", "paid_at"]) ?? new Date();
      if (options?.desde && fechaPago < options.desde) continue;
      if (options?.hasta && fechaPago > options.hasta) continue;

      const externalPagoId =
        pickString(item, ["payment_event_id", "pago_id", "id"]) ??
        `AT-PAGO-${fechaPago.toISOString()}`;

      const existing = await this.externalReferenceService.findByExternalId(
        EXTERNAL_SYSTEM_CODES.AT_INFORMA,
        ExternalEntityType.PAGO,
        externalPagoId,
      );
      if (existing) {
        skipped += 1;
        continue;
      }

      const contratoExternalId = pickString(item, ["contrato_id", "id_contrato"]);
      if (!contratoExternalId) {
        skipped += 1;
        continue;
      }
      const contratoRef = await this.externalReferenceService.findByExternalId(
        EXTERNAL_SYSTEM_CODES.AT_INFORMA,
        ExternalEntityType.CONTRATO,
        contratoExternalId,
      );
      if (!contratoRef) {
        skipped += 1;
        continue;
      }

      let cuotaId: number | undefined;
      const cuotaExternalId = pickString(item, ["cuota_id", "id_cuota"]);
      if (cuotaExternalId) {
        const cuotaRef = await this.externalReferenceService.findByExternalId(
          EXTERNAL_SYSTEM_CODES.AT_INFORMA,
          ExternalEntityType.CUOTA,
          cuotaExternalId,
        );
        cuotaId = cuotaRef?.entity_id;
      }

      const contrato = await this.db.contrato.findUnique({
        where: { id: contratoRef.entity_id },
      });
      if (!contrato) {
        skipped += 1;
        continue;
      }

      const monto = toMoney(pickNumber(item, ["monto", "monto_pagado"]), 0);
      const pago = await this.db.pago.create({
        data: {
          cliente_id: contrato.cliente_id,
          contrato_id: contrato.id,
          cuota_id: cuotaId,
          fecha_pago: fechaPago,
          monto_pagado: monto,
          medio_pago: pickString(item, ["medio_pago", "canal"]) ?? "at-informa",
          referencia: pickString(item, ["referencia", "comprobante"]) ?? externalPagoId,
          payment_event_id: pickString(item, ["payment_event_id"]),
        },
      });

      await this.externalReferenceService.upsertReference({
        systemCode: EXTERNAL_SYSTEM_CODES.AT_INFORMA,
        entityType: ExternalEntityType.PAGO,
        entityId: pago.id,
        externalId: externalPagoId,
        metadata: item as Prisma.InputJsonValue,
      });

      if (cuotaId) {
        await this.paymentApplicationService.aplicarPagoACuotas(pago.id, [cuotaId]);
      }

      synced += 1;
    }

    return { synced, skipped };
  }

  async syncAll(options: SyncOptions = {}) {
    const systemId = await this.externalReferenceService.ensureSystem(
      EXTERNAL_SYSTEM_CODES.AT_INFORMA,
      process.env.AT_INFORMA_BASE_URL,
    );
    const desde = options.desde ? new Date(options.desde) : undefined;
    const hasta = options.hasta ? new Date(options.hasta) : undefined;

    const syncLog = await this.db.externalSyncLog.create({
      data: {
        sistema_externo_id: systemId,
        sync_type: "AT_INFORMA_FULL_SYNC",
        status: ExternalSyncStatus.STARTED,
        request_payload: options as unknown as Prisma.InputJsonValue,
      },
    });

    try {
      const clientes = await this.syncClientes();
      const planPagos = await this.syncPlanPagos({
        soloPendientes: options.soloPendientes,
      });
      const cobranza = await this.syncCobranza({ desde, hasta });

      const summary = { clientes, planPagos, cobranza };
      await this.db.externalSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: ExternalSyncStatus.SUCCESS,
          finished_at: new Date(),
          response_summary: summary as unknown as Prisma.InputJsonValue,
        },
      });
      return { sync_log_id: syncLog.id, ...summary };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error de sincronizaci\u00f3n";
      await this.db.externalSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: ExternalSyncStatus.FAILED,
          finished_at: new Date(),
          error_message: message,
        },
      });
      throw error;
    }
  }
}
