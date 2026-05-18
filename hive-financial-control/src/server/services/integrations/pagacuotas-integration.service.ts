import {
  EstadoContrato,
  EstadoCuota,
  EstadoPago,
  ExternalEntityType,
  IntegrationEventStatus,
  Prisma,
  type IntegrationEvent,
  type PrismaClient,
} from "@prisma/client";
import { CrmClient } from "./crm.client";
import { prisma } from "@/lib/prisma";
import { AtInformaClient } from "./at-informa.client";
import { EXTERNAL_SYSTEM_CODES } from "./integration.constants";
import { ExternalReferenceService } from "./external-reference.service";
import { IntegrationEventService } from "./integration-event.service";
import { buildAtInformaPaymentPayload } from "./pagacuotas-sync-payload";
import { PaymentApplicationService } from "./payment-application.service";
import { PaymentPortalService } from "./payment-portal.service";
import { pickDate, pickNumber, pickString, pickStringArray, toMoney } from "./payload.utils";

type DbLike = PrismaClient;
type RawPayload = Record<string, unknown>;

type ServiceDependencies = {
  integrationEventService?: IntegrationEventService;
  externalReferenceService?: ExternalReferenceService;
  paymentPortalService?: PaymentPortalService;
  paymentApplicationService?: PaymentApplicationService;
};

const PAYABLE_STATES = new Set<EstadoCuota>([
  EstadoCuota.PENDIENTE,
  EstadoCuota.PARCIAL,
  EstadoCuota.VENCIDA,
]);
const VALIDATION_ALLOWED_STATES = new Set<EstadoCuota>([
  EstadoCuota.PENDIENTE,
  EstadoCuota.VENCIDA,
]);

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return {};
}

export class PagaCuotasIntegrationService {
  private readonly externalReferenceService: ExternalReferenceService;
  private readonly integrationEventService: IntegrationEventService;
  private readonly paymentPortalService: PaymentPortalService;
  private readonly paymentApplicationService: PaymentApplicationService;

  constructor(
    private readonly db: DbLike = prisma,
    private readonly atInformaClient = new AtInformaClient(),
    deps: ServiceDependencies = {},
  ) {
    this.externalReferenceService =
      deps.externalReferenceService ?? new ExternalReferenceService(db);
    this.integrationEventService =
      deps.integrationEventService ?? new IntegrationEventService(db);
    this.paymentPortalService =
      deps.paymentPortalService ?? new PaymentPortalService(db);
    this.paymentApplicationService =
      deps.paymentApplicationService ?? new PaymentApplicationService(db);
  }

  async registerPaymentAttempt(payload: RawPayload) {
    const externalAttemptId = pickString(payload, ["external_attempt_id"]);
    if (!externalAttemptId) throw new Error("external_attempt_id es requerido.");

    const clienteId = pickNumber(payload, ["cliente_id"]);
    const contratoId = pickNumber(payload, ["contrato_id"]);
    if (!clienteId || !contratoId) throw new Error("cliente_id y contrato_id son requeridos.");

    const monto = toMoney(pickNumber(payload, ["monto", "amount"]), 0);
    if (monto <= 0) throw new Error("monto debe ser mayor a 0.");

    const event = await this.integrationEventService.ensureIdempotency({
      systemCode: EXTERNAL_SYSTEM_CODES.PAGACUOTAS,
      eventType: "payment-attempt",
      externalEventId: externalAttemptId,
      idempotencyKey: `pagacuotas:payment-attempt:${externalAttemptId}`,
      payload: payload as Prisma.InputJsonValue,
    });

    const existingAttempt = this.extractAttempt(event.event);
    if (event.duplicated && event.event.status === IntegrationEventStatus.PROCESSED) {
      return {
        ok: true,
        status: "idempotent",
        attempt: existingAttempt ?? {
          id: event.event.id,
          external_attempt_id: externalAttemptId,
        },
      };
    }

    try {
      const [cliente, contrato] = await Promise.all([
        this.db.cliente.findUnique({ where: { id: clienteId } }),
        this.db.contrato.findUnique({ where: { id: contratoId } }),
      ]);
      if (!cliente) throw new Error("cliente_id no existe.");
      if (!contrato) throw new Error("contrato_id no existe.");
      if (contrato.cliente_id !== cliente.id) {
        throw new Error("contrato_id no pertenece al cliente indicado.");
      }

      const providerTransactionId = pickString(payload, [
        "provider_transaction_id",
        "numero_transaccion",
      ]);
      if (providerTransactionId) {
        const attempts = await this.db.integrationEvent.findMany({
          where: {
            event_type: "payment-attempt",
            sistema_externo: { codigo: EXTERNAL_SYSTEM_CODES.PAGACUOTAS },
          },
          orderBy: { id: "desc" },
          take: 200,
        });
        const duplicateTx = attempts.find((attempt) => {
          if (attempt.id === event.event.id) return false;
          const raw = asObject(attempt.payload);
          const existingTx = pickString(raw, [
            "provider_transaction_id",
            "numero_transaccion",
          ]);
          return existingTx === providerTransactionId;
        });
        if (duplicateTx) {
          const duplicateAttempt = this.extractAttempt(duplicateTx);
          await this.integrationEventService.markProcessed(event.event.id, {
            status: "idempotent",
            duplicate_event_id: duplicateTx.id,
          } as Prisma.InputJsonValue);
          return {
            ok: true,
            status: "idempotent",
            attempt: duplicateAttempt ?? {
              id: duplicateTx.id,
              external_attempt_id: pickString(
                asObject(duplicateTx.payload),
                ["external_attempt_id"],
              ),
            },
          };
        }
      }

      const cuotaIdsRaw =
        Array.isArray(payload.cuota_ids) && payload.cuota_ids.length > 0
          ? payload.cuota_ids
          : pickStringArray(payload, ["cuota_ids"]) ?? [];
      const cuotaIds = cuotaIdsRaw
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));

      if (cuotaIds.length > 0) {
        const cuotas = await this.db.cuota.findMany({
          where: { id: { in: cuotaIds } },
        });
        if (cuotas.length !== cuotaIds.length) {
          throw new Error("Una o más cuotas no existen.");
        }
        if (cuotas.some((cuota) => cuota.contrato_id !== contrato.id)) {
          throw new Error("Existen cuotas que no pertenecen al contrato.");
        }
        if (cuotas.some((cuota) => !PAYABLE_STATES.has(cuota.estado))) {
          throw new Error("Existen cuotas no pagables en el intento.");
        }
      }

      const attempt = {
        id: event.event.id,
        external_attempt_id: externalAttemptId,
        estado: pickString(payload, ["estado"]) ?? "iniciado",
        monto,
        cliente_id: cliente.id,
        contrato_id: contrato.id,
        cuota_ids: cuotaIds,
        provider: pickString(payload, ["provider"]),
        provider_transaction_id: providerTransactionId,
        metodo_pago: pickString(payload, ["metodo_pago"]),
      };

      await this.integrationEventService.markProcessed(event.event.id, {
        status: "registered",
        attempt,
      } as Prisma.InputJsonValue);

      return {
        ok: true,
        status: "registered",
        attempt,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error registrando intento de pago";
      await this.integrationEventService.markFailed(event.event.id, message);
      throw error;
    }
  }

  async registerRejectedPayment(payload: RawPayload) {
    const externalPaymentId = pickString(payload, [
      "external_payment_id",
      "payment_event_id",
      "payment_id",
    ]);
    const externalAttemptId = pickString(payload, ["external_attempt_id"]);
    const providerTransactionId = pickString(payload, [
      "provider_transaction_id",
      "numero_transaccion",
    ]);
    const eventKeyBase = externalPaymentId ?? externalAttemptId ?? providerTransactionId;
    if (!eventKeyBase) {
      throw new Error(
        "external_payment_id, external_attempt_id o provider_transaction_id es requerido.",
      );
    }

    const event = await this.integrationEventService.ensureIdempotency({
      systemCode: EXTERNAL_SYSTEM_CODES.PAGACUOTAS,
      eventType: "payments.rejected",
      externalEventId: externalPaymentId ?? externalAttemptId,
      idempotencyKey: `pagacuotas:payments.rejected:${eventKeyBase}`,
      payload: payload as Prisma.InputJsonValue,
    });

    if (event.duplicated && event.event.status === IntegrationEventStatus.PROCESSED) {
      return {
        ok: true,
        status: "idempotent",
        integration_event_id: event.event.id,
      };
    }

    try {
      if (externalAttemptId) {
        const attemptEvent = await this.db.integrationEvent.findFirst({
          where: {
            event_type: "payment-attempt",
            external_event_id: externalAttemptId,
            sistema_externo: { codigo: EXTERNAL_SYSTEM_CODES.PAGACUOTAS },
          },
        });
        if (attemptEvent) {
          const current = asObject(attemptEvent.result_payload);
          await this.db.integrationEvent.update({
            where: { id: attemptEvent.id },
            data: {
              result_payload: {
                ...current,
                status: "rejected",
                motivo_rechazo: pickString(payload, ["motivo_rechazo"]),
              } as Prisma.InputJsonValue,
            },
          });
        }
      }

      if (externalPaymentId) {
        await this.updatePaymentStatusByExternalId(externalPaymentId, EstadoPago.RECHAZADO);
      }

      await this.integrationEventService.markProcessed(event.event.id, {
        status: "registered",
        rejected: true,
      } as Prisma.InputJsonValue);

      return {
        ok: true,
        status: "registered",
        integration_event_id: event.event.id,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error registrando pago rechazado";
      await this.integrationEventService.markFailed(event.event.id, message);
      throw error;
    }
  }

  async registerReversedPayment(payload: RawPayload) {
    const externalReversalId = pickString(payload, ["external_reversal_id"]);
    if (!externalReversalId) throw new Error("external_reversal_id es requerido.");

    const event = await this.integrationEventService.ensureIdempotency({
      systemCode: EXTERNAL_SYSTEM_CODES.PAGACUOTAS,
      eventType: "payments.reversed",
      externalEventId: externalReversalId,
      idempotencyKey: `pagacuotas:payments.reversed:${externalReversalId}`,
      payload: payload as Prisma.InputJsonValue,
    });

    if (event.duplicated && event.event.status === IntegrationEventStatus.PROCESSED) {
      return {
        ok: true,
        status: "idempotent",
        integration_event_id: event.event.id,
      };
    }

    try {
      const originalPayment = await this.findOriginalPayment(payload);
      if (!originalPayment) {
        await this.integrationEventService.markFailed(
          event.event.id,
          "Pago original no encontrado para reversa.",
        );
        return {
          ok: true,
          status: "pending_review",
          integration_event_id: event.event.id,
        };
      }

      const fechaReversa = pickDate(payload, ["fecha_reversa", "fecha_evento"]) ?? new Date();
      const montoReversadoRaw = toMoney(
        pickNumber(payload, ["monto_reversado", "monto", "amount"]),
        Math.abs(Number(originalPayment.monto_pagado)),
      );
      const montoReversado = Math.max(0, montoReversadoRaw);

      const reverseResult = await this.db.$transaction(async (tx) => {
        await tx.pago.update({
          where: { id: originalPayment.id },
          data: { estado: EstadoPago.REVERSADO },
        });

        const aplicaciones = await tx.aplicacionPago.findMany({
          where: { pago_id: originalPayment.id },
          orderBy: { id: "desc" },
        });

        if (aplicaciones.length === 0 || montoReversado <= 0) {
          return { reversedPagoId: null, cuotasAfectadas: [] as number[] };
        }

        const pagoReversa = await tx.pago.create({
          data: {
            cliente_id: originalPayment.cliente_id,
            contrato_id: originalPayment.contrato_id,
            cuota_id: originalPayment.cuota_id,
            fecha_pago: fechaReversa,
            monto_pagado: -montoReversado,
            estado: EstadoPago.REVERSADO,
            medio_pago: originalPayment.medio_pago,
            referencia: `REVERSA:${externalReversalId}`,
            observacion: "Reversa registrada desde PagaCuotas",
          },
        });

        let remaining = montoReversado;
        const cuotasAfectadas = new Set<number>();
        for (const aplicacion of aplicaciones) {
          if (remaining <= 0) break;
          const current = Number(aplicacion.monto_aplicado);
          if (current <= 0) continue;
          const toReverse = Math.min(current, remaining);
          await tx.aplicacionPago.create({
            data: {
              pago_id: pagoReversa.id,
              cuota_id: aplicacion.cuota_id,
              monto_aplicado: -toReverse,
            },
          });
          cuotasAfectadas.add(aplicacion.cuota_id);
          remaining = Math.max(0, remaining - toReverse);
        }

        for (const cuotaId of cuotasAfectadas) {
          await this.paymentApplicationService.recalcularCuota(cuotaId, tx);
        }
        await this.paymentApplicationService.recalcularContrato(
          originalPayment.contrato_id,
          tx,
        );

        return {
          reversedPagoId: pagoReversa.id,
          cuotasAfectadas: Array.from(cuotasAfectadas),
        };
      });

      await this.integrationEventService.markProcessed(event.event.id, {
        status: "processed",
        original_pago_id: originalPayment.id,
        reversed_pago_id: reverseResult.reversedPagoId,
        cuotas_afectadas: reverseResult.cuotasAfectadas,
        at_informa_sync: "PENDING_MANUAL_RECONCILIATION",
      } as Prisma.InputJsonValue);

      return {
        ok: true,
        status: "processed",
        integration_event_id: event.event.id,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error registrando reversa";
      await this.integrationEventService.markFailed(event.event.id, message);
      throw error;
    }
  }

  async registerConfirmedPayment(payload: RawPayload) {
    const externalPaymentId = pickString(payload, [
      "external_payment_id",
      "payment_event_id",
      "event_id",
      "payment_id",
      "id",
    ]);
    const eventId =
      pickString(payload, ["payment_event_id", "event_id", "payment_id", "id"]) ??
      undefined;
    const identifier = pickString(payload, ["identifier", "rut", "cliente_identifier"]);
    if (!identifier) {
      throw new Error("identifier es requerido.");
    }

    const monto = toMoney(pickNumber(payload, ["amount", "monto", "monto_pagado"]), 0);
    if (monto <= 0) {
      throw new Error("amount debe ser mayor a cero.");
    }

    const paidAt = pickDate(payload, ["paid_at", "fecha_pago", "confirmed_at"]) ?? new Date();
    const contratoIdRaw = pickString(payload, ["contrato_id", "contract_id"]);
    const referencia =
      pickString(payload, [
        "reference",
        "referencia",
        "provider_reference",
        "provider_transaction_id",
        "numero_transaccion",
      ]) ?? undefined;
    const cuotaIdsRaw = pickStringArray(payload, ["cuota_ids", "installment_ids"]);

    const idempotencyKey = externalPaymentId
      ? `pagacuotas:confirmed:${externalPaymentId}`
      : `pagacuotas:confirmed:${identifier}:${monto}:${paidAt.toISOString().slice(0, 19)}`;

    const idempotency = await this.integrationEventService.ensureIdempotency({
      systemCode: EXTERNAL_SYSTEM_CODES.PAGACUOTAS,
      eventType: "payments.confirmed",
      externalEventId: externalPaymentId,
      idempotencyKey,
      payload: payload as Prisma.InputJsonValue,
    });

    if (idempotency.duplicated && idempotency.event.status === IntegrationEventStatus.PROCESSED) {
      return {
        ok: true,
        duplicated: true,
        integration_event_id: idempotency.event.id,
      };
    }

    try {
      const cliente = await this.paymentPortalService.findClienteByIdentifier(identifier);
      if (!cliente) {
        throw new Error("Cliente no encontrado para identifier.");
      }

      let contratoId: number | null = null;
      if (contratoIdRaw) {
        contratoId = await this.paymentPortalService.resolveContratoId(contratoIdRaw);
      }
      if (!contratoId) {
        const contrato = await this.db.contrato.findFirst({
          where: { cliente_id: cliente.id },
          orderBy: { created_at: "desc" },
        });
        contratoId = contrato?.id ?? null;
      }
      if (!contratoId) {
        throw new Error("No se encontró contrato para aplicar pago.");
      }

      const contratoInfo = await this.db.contrato.findUnique({
        where: { id: contratoId },
      });
      const wasInPendingInitialPayment =
        contratoInfo?.estado === EstadoContrato.PENDING_INITIAL_PAYMENT;

      const cuotaIds = (
        await Promise.all(
          (cuotaIdsRaw ?? []).map(async (rawId) => {
            const internal = Number(rawId);
            if (Number.isFinite(internal)) return internal;
            const ref = await this.externalReferenceService.findByExternalId(
              EXTERNAL_SYSTEM_CODES.PAGACUOTAS,
              ExternalEntityType.CUOTA,
              rawId,
            );
            return ref?.entity_id;
          }),
        )
      ).filter((value): value is number => Number.isFinite(value));

      const pago = await this.db.pago.create({
        data: {
          cliente_id: cliente.id,
          contrato_id: contratoId,
          fecha_pago: paidAt,
          monto_pagado: monto,
          estado: EstadoPago.CONFIRMADO,
          medio_pago: "pagacuotas",
          payment_event_id: externalPaymentId ?? eventId,
          referencia: referencia ?? externalPaymentId ?? eventId,
          observacion: "Pago confirmado desde PagaCuotas",
        },
      });

      await this.externalReferenceService.upsertReference({
        systemCode: EXTERNAL_SYSTEM_CODES.PAGACUOTAS,
        entityType: ExternalEntityType.PAGO,
        entityId: pago.id,
        externalId: eventId ?? String(pago.id),
        metadata: payload as Prisma.InputJsonValue,
      });

      const cuotasDestino =
        cuotaIds.length > 0
          ? cuotaIds
          : (
              await this.db.cuota.findMany({
                where: { contrato_id: contratoId },
                orderBy: [{ fecha_vencimiento: "asc" }, { numero_cuota: "asc" }],
              })
            ).map((cuota) => cuota.id);

      const application = await this.paymentApplicationService.aplicarPagoACuotas(
        pago.id,
        cuotasDestino,
      );

      let atResponse: unknown = null;

      if (wasInPendingInitialPayment && (contratoInfo?.crm_opportunity_id || contratoInfo?.crm_lead_id)) {
        // Initial payment on CRM-originated contract:
        // 1. Enable remaining cuotas that were held back
        await this.db.cuota.updateMany({
          where: {
            contrato_id: contratoId,
            cobrable: false,
            estado: EstadoCuota.PENDIENTE,
          },
          data: { cobrable: true },
        });
        // 2. Create AT.Informa case + notify CRM asynchronously (non-blocking)
        setImmediate(() => {
          this.triggerInitialPaymentActions(
            contratoInfo as { id: number; crm_lead_id: number | null; crm_opportunity_id: string | null; correlation_id: string | null; tipo_servicio: string },
            cliente as { rut: string; nombre: string; email: string | null; telefono: string | null },
            monto,
            eventId,
            referencia,
          ).catch(() => {
            // Failures are logged inside — pago is confirmed regardless
          });
        });
        atResponse = { deferred: true, reason: "initial_payment_case_creation" };
      } else {
        // Regular payment on an already-active contract: sync to AT.Informa
        const syncReference = referencia ?? eventId ?? `PAGO-${pago.id}`;
        let casoExternalId: string | undefined;
        let numeroCuota: number | undefined;

        if (!eventId) {
          const firstApplied = await this.db.aplicacionPago.findFirst({
            where: { pago_id: pago.id },
            include: { cuota: true },
          });
          if (firstApplied?.cuota.caso_legal_id) {
            const caseRef = await this.externalReferenceService.findByEntity(
              EXTERNAL_SYSTEM_CODES.AT_INFORMA,
              ExternalEntityType.CASO_LEGAL,
              firstApplied.cuota.caso_legal_id,
            );
            if (caseRef) {
              casoExternalId = caseRef.external_id;
              numeroCuota = firstApplied.cuota.numero_cuota;
            }
          }
        }

        if (eventId || (casoExternalId && numeroCuota)) {
          const atPayload = buildAtInformaPaymentPayload({
            monto,
            paidAt,
            referencia: syncReference,
            paymentEventId: eventId,
            casoExternalId,
            numeroCuota,
          });
          atResponse = await this.atInformaClient
            .registrarPago(atPayload)
            .catch((err: unknown) => ({
              error: err instanceof Error ? err.message : "AT-INFORMA sync failed",
            }));
        }
      }

      await this.integrationEventService.markProcessed(idempotency.event.id, {
        pago_id: pago.id,
        at_informa_response: atResponse,
        aplicacion: application,
      } as Prisma.InputJsonValue);

      return {
        ok: true,
        integration_event_id: idempotency.event.id,
        pago_id: pago.id,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error registrando pago confirmado";
      await this.integrationEventService.markFailed(idempotency.event.id, message);
      throw error;
    }
  }

  async validatePaymentIntent(payload: RawPayload) {
    const errors: string[] = [];
    const externalAttemptId = pickString(payload, ["external_attempt_id"]);
    if (!externalAttemptId) {
      errors.push("external_attempt_id es requerido.");
    }

    const clienteId = pickNumber(payload, ["cliente_id"]);
    const contratoId = pickNumber(payload, ["contrato_id"]);
    const montoTotal = toMoney(pickNumber(payload, ["monto_total", "monto", "amount"]), 0);
    const cuotaIdsRaw =
      (pickStringArray(payload, ["cuota_ids"]) ?? []).map((value) => Number(value)) ?? [];
    const cuotaIds = cuotaIdsRaw.filter((value) => Number.isFinite(value));

    if (!clienteId) errors.push("cliente_id es requerido.");
    if (!contratoId) errors.push("contrato_id es requerido.");
    if (cuotaIds.length === 0) errors.push("cuota_ids debe contener al menos una cuota.");
    if (montoTotal <= 0) errors.push("monto_total debe ser mayor a 0.");

    if (externalAttemptId) {
      const idempotency = await this.integrationEventService.ensureIdempotency({
        systemCode: EXTERNAL_SYSTEM_CODES.PAGACUOTAS,
        eventType: "payment-intents.validate",
        externalEventId: externalAttemptId,
        idempotencyKey: `pagacuotas:payment-intents.validate:${externalAttemptId}`,
        payload: payload as Prisma.InputJsonValue,
      });
      if (idempotency.duplicated && idempotency.event.status === IntegrationEventStatus.PROCESSED) {
        const previous = asObject(idempotency.event.result_payload);
        return {
          valid: Boolean(previous.valid),
          errors: (previous.errors as string[]) ?? [],
          idempotent: true,
        };
      }
    }

    if (errors.length === 0) {
      const [cliente, contrato, cuotas] = await Promise.all([
        this.db.cliente.findUnique({ where: { id: clienteId! } }),
        this.db.contrato.findUnique({ where: { id: contratoId! } }),
        this.db.cuota.findMany({ where: { id: { in: cuotaIds } } }),
      ]);

      if (!cliente) errors.push("cliente_id no existe.");
      if (!contrato) errors.push("contrato_id no existe.");
      if (cliente && contrato && contrato.cliente_id !== cliente.id) {
        errors.push("contrato_id no pertenece al cliente.");
      }
      if (cuotas.length !== cuotaIds.length) {
        errors.push("Una o más cuotas no existen.");
      }
      if (cuotas.some((cuota) => cuota.contrato_id !== contratoId)) {
        errors.push("Una o más cuotas no pertenecen al contrato.");
      }
      const invalidStates = cuotas.filter((cuota) => !VALIDATION_ALLOWED_STATES.has(cuota.estado));
      if (invalidStates.length > 0) {
        errors.push("Existen cuotas no pagables (deben estar en PENDIENTE o VENCIDA).");
      }
      const forbiddenStates = new Set<EstadoCuota>([
        EstadoCuota.PAGADA,
        EstadoCuota.ANULADA,
        EstadoCuota.REPROGRAMADA,
      ]);
      if (cuotas.some((cuota) => forbiddenStates.has(cuota.estado))) {
        errors.push("Existen cuotas en estado no permitido para cobro.");
      }
      const expectedAmount = toMoney(
        cuotas.reduce((acc, cuota) => acc + Number(cuota.saldo_pendiente), 0),
        0,
      );
      if (montoTotal !== expectedAmount) {
        errors.push("monto_total no coincide con el saldo de las cuotas.");
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private extractAttempt(event: IntegrationEvent) {
    const result = asObject(event.result_payload);
    const attempt = asObject(result.attempt);
    if (!attempt.id) return null;
    return attempt;
  }

  private async findOriginalPayment(payload: RawPayload) {
    const externalPaymentId = pickString(payload, ["external_payment_id"]);
    const numeroTransaccion = pickString(payload, [
      "numero_transaccion",
      "provider_transaction_id",
    ]);

    if (externalPaymentId) {
      const paymentRef = await this.externalReferenceService.findByExternalId(
        EXTERNAL_SYSTEM_CODES.PAGACUOTAS,
        ExternalEntityType.PAGO,
        externalPaymentId,
      );
      if (paymentRef) {
        const byRef = await this.db.pago.findUnique({ where: { id: paymentRef.entity_id } });
        if (byRef) return byRef;
      }
      const byEventId = await this.db.pago.findFirst({
        where: { payment_event_id: externalPaymentId },
      });
      if (byEventId) return byEventId;
    }

    if (numeroTransaccion) {
      return this.db.pago.findFirst({
        where: { referencia: numeroTransaccion },
      });
    }

    return null;
  }

  private async updatePaymentStatusByExternalId(externalPaymentId: string, status: EstadoPago) {
    const paymentRef = await this.externalReferenceService.findByExternalId(
      EXTERNAL_SYSTEM_CODES.PAGACUOTAS,
      ExternalEntityType.PAGO,
      externalPaymentId,
    );
    if (!paymentRef) return;
    await this.db.pago.update({
      where: { id: paymentRef.entity_id },
      data: { estado: status },
    });
  }

  private async triggerInitialPaymentActions(
    contrato: {
      id: number;
      crm_lead_id: number | null;
      crm_opportunity_id: string | null;
      correlation_id: string | null;
      tipo_servicio: string;
    },
    cliente: {
      rut: string;
      nombre: string;
      email: string | null;
      telefono: string | null;
    },
    monto: number,
    eventId: string | undefined,
    referencia: string | undefined,
  ) {
    const caseCode = `SIS-${contrato.id}-${Date.now()}`;
    const casePayload = {
      rut: cliente.rut,
      nombre: cliente.nombre,
      email: cliente.email ?? null,
      telefono: cliente.telefono ?? null,
      case_code: caseCode,
      service_category: contrato.tipo_servicio,
      crm_opportunity_id: contrato.crm_opportunity_id,
      crm_lead_id: contrato.crm_lead_id,
      correlation_id: contrato.correlation_id,
      initial_payment_amount: monto,
      contrato_id_sis_contable: contrato.id,
    };

    let caseCreated = false;
    let atCaseId: string | undefined;
    try {
      const atResponse = await this.atInformaClient.createLegalCase(casePayload);
      caseCreated = true;
      atCaseId = atResponse?.caseId ?? undefined;
    } catch (err) {
      // Non-fatal: log for manual retry
      console.error(
        `[PagaCuotasIntegration] AT.Informa case creation failed for contrato ${contrato.id}:`,
        err instanceof Error ? err.message : err,
      );
      await this.integrationEventService
        .createEvent({
          systemCode: EXTERNAL_SYSTEM_CODES.AT_INFORMA,
          eventType: "at_informa.case.create.failed",
          idempotencyKey: `at-informa:case:failed:${contrato.id}:${eventId ?? referencia ?? Date.now()}`,
          payload: { contrato_id: contrato.id, case_payload: casePayload, error: err instanceof Error ? err.message : String(err) } as Prisma.InputJsonValue,
        })
        .catch(() => {});
    }

    if (!contrato.crm_lead_id) return;

    const crmClient = new CrmClient();
    try {
      await crmClient.notifyPaymentConfirmed(
        contrato.crm_lead_id,
        contrato.id,
        contrato.correlation_id,
      );
    } catch (err) {
      console.error(
        `[PagaCuotasIntegration] CRM payment_confirmed callback failed for lead ${contrato.crm_lead_id}:`,
        err instanceof Error ? err.message : err,
      );
    }

    if (!caseCreated) return;

    try {
      await crmClient.notifyServiceStarted(
        contrato.crm_lead_id,
        contrato.id,
        contrato.correlation_id,
      );
    } catch (err) {
      console.error(
        `[PagaCuotasIntegration] CRM service_started callback failed for lead ${contrato.crm_lead_id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
