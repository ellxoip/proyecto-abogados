import { EstadoCuota, IntegrationEventStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { PagaCuotasIntegrationService } from "../integrations/pagacuotas-integration.service";

function baseEvent(id: number) {
  return {
    id,
    status: IntegrationEventStatus.PENDING,
    payload: {},
    result_payload: null,
  };
}

describe("PagaCuotasIntegrationService", () => {
  it("crea intento nuevo", async () => {
    const integrationEventService = {
      ensureIdempotency: vi.fn().mockResolvedValue({
        event: baseEvent(1),
        duplicated: false,
      }),
      markProcessed: vi.fn().mockResolvedValue({}),
      markFailed: vi.fn().mockResolvedValue({}),
    };

    const db = {
      cliente: { findUnique: vi.fn().mockResolvedValue({ id: 1 }) },
      contrato: { findUnique: vi.fn().mockResolvedValue({ id: 10, cliente_id: 1 }) },
      cuota: {
        findMany: vi.fn().mockResolvedValue([
          { id: 100, contrato_id: 10, estado: EstadoCuota.PENDIENTE },
        ]),
      },
      integrationEvent: { findMany: vi.fn().mockResolvedValue([]) },
    };

    const service = new PagaCuotasIntegrationService(db as never, {} as never, {
      integrationEventService: integrationEventService as never,
    });

    const result = await service.registerPaymentAttempt({
      external_attempt_id: "pc_attempt_123",
      cliente_id: 1,
      contrato_id: 10,
      cuota_ids: [100],
      monto: 300000,
      estado: "iniciado",
    });

    expect(result.status).toBe("registered");
    expect(result.attempt.external_attempt_id).toBe("pc_attempt_123");
    expect(integrationEventService.markProcessed).toHaveBeenCalled();
  });

  it("mismo external_attempt_id no duplica", async () => {
    const integrationEventService = {
      ensureIdempotency: vi.fn().mockResolvedValue({
        event: {
          ...baseEvent(7),
          status: IntegrationEventStatus.PROCESSED,
          result_payload: { attempt: { id: 7, external_attempt_id: "pc_attempt_123" } },
        },
        duplicated: true,
      }),
      markProcessed: vi.fn(),
      markFailed: vi.fn(),
    };

    const service = new PagaCuotasIntegrationService({} as never, {} as never, {
      integrationEventService: integrationEventService as never,
    });
    const result = await service.registerPaymentAttempt({
      external_attempt_id: "pc_attempt_123",
      cliente_id: 1,
      contrato_id: 10,
      monto: 10,
    });

    expect(result.status).toBe("idempotent");
    expect(integrationEventService.markProcessed).not.toHaveBeenCalled();
  });

  it("rechaza cuotas de otro contrato", async () => {
    const integrationEventService = {
      ensureIdempotency: vi.fn().mockResolvedValue({
        event: baseEvent(2),
        duplicated: false,
      }),
      markProcessed: vi.fn(),
      markFailed: vi.fn().mockResolvedValue({}),
    };

    const db = {
      cliente: { findUnique: vi.fn().mockResolvedValue({ id: 1 }) },
      contrato: { findUnique: vi.fn().mockResolvedValue({ id: 10, cliente_id: 1 }) },
      cuota: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 100, contrato_id: 99, estado: EstadoCuota.PENDIENTE }]),
      },
      integrationEvent: { findMany: vi.fn().mockResolvedValue([]) },
    };

    const service = new PagaCuotasIntegrationService(db as never, {} as never, {
      integrationEventService: integrationEventService as never,
    });

    await expect(
      service.registerPaymentAttempt({
        external_attempt_id: "pc_attempt_123",
        cliente_id: 1,
        contrato_id: 10,
        cuota_ids: [100],
        monto: 300000,
      }),
    ).rejects.toThrow("no pertenecen al contrato");
    expect(integrationEventService.markFailed).toHaveBeenCalled();
  });

  it("rechaza monto invalido en intentos", async () => {
    const integrationEventService = {
      ensureIdempotency: vi.fn(),
    };
    const service = new PagaCuotasIntegrationService({} as never, {} as never, {
      integrationEventService: integrationEventService as never,
    });
    await expect(
      service.registerPaymentAttempt({
        external_attempt_id: "pc_attempt_123",
        cliente_id: 1,
        contrato_id: 10,
        monto: 0,
      }),
    ).rejects.toThrow("monto debe ser mayor a 0");
    expect(integrationEventService.ensureIdempotency).not.toHaveBeenCalled();
  });

  it("registra rechazo sin crear pago confirmado", async () => {
    const integrationEventService = {
      ensureIdempotency: vi.fn().mockResolvedValue({
        event: baseEvent(3),
        duplicated: false,
      }),
      markProcessed: vi.fn().mockResolvedValue({}),
      markFailed: vi.fn().mockResolvedValue({}),
    };
    const db = {
      integrationEvent: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
      },
      pago: { create: vi.fn(), update: vi.fn() },
    };
    const service = new PagaCuotasIntegrationService(db as never, {} as never, {
      integrationEventService: integrationEventService as never,
    });

    const result = await service.registerRejectedPayment({
      external_attempt_id: "pc_attempt_1",
      motivo_rechazo: "fondos_insuficientes",
    });
    expect(result.status).toBe("registered");
    expect(db.pago.create).not.toHaveBeenCalled();
  });

  it("duplicado en rejected no duplica evento", async () => {
    const integrationEventService = {
      ensureIdempotency: vi.fn().mockResolvedValue({
        event: { ...baseEvent(4), status: IntegrationEventStatus.PROCESSED },
        duplicated: true,
      }),
      markProcessed: vi.fn(),
      markFailed: vi.fn(),
    };
    const service = new PagaCuotasIntegrationService({} as never, {} as never, {
      integrationEventService: integrationEventService as never,
    });
    const result = await service.registerRejectedPayment({
      external_payment_id: "pc_payment_1",
    });
    expect(result.status).toBe("idempotent");
    expect(integrationEventService.markProcessed).not.toHaveBeenCalled();
  });

  it("reversa pago existente y recalcula cuota/contrato", async () => {
    const integrationEventService = {
      ensureIdempotency: vi.fn().mockResolvedValue({
        event: baseEvent(5),
        duplicated: false,
      }),
      markProcessed: vi.fn().mockResolvedValue({}),
      markFailed: vi.fn().mockResolvedValue({}),
    };
    const externalReferenceService = {
      findByExternalId: vi.fn().mockResolvedValue({ entity_id: 50 }),
    };
    const paymentApplicationService = {
      recalcularCuota: vi.fn().mockResolvedValue({}),
      recalcularContrato: vi.fn().mockResolvedValue({}),
    };

    const tx = {
      pago: {
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({ id: 88 }),
      },
      aplicacionPago: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 1, cuota_id: 100, monto_aplicado: 150000 }]),
        create: vi.fn().mockResolvedValue({}),
      },
    };
    const db = {
      pago: {
        findUnique: vi.fn().mockResolvedValue({
          id: 50,
          cliente_id: 1,
          contrato_id: 10,
          cuota_id: 100,
          monto_pagado: 150000,
          medio_pago: "tarjeta",
        }),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn().mockImplementation(async (cb: (arg: unknown) => unknown) => cb(tx)),
    };

    const service = new PagaCuotasIntegrationService(db as never, {} as never, {
      integrationEventService: integrationEventService as never,
      externalReferenceService: externalReferenceService as never,
      paymentApplicationService: paymentApplicationService as never,
    });

    const result = await service.registerReversedPayment({
      external_reversal_id: "pc_reversal_1",
      external_payment_id: "pc_payment_1",
      monto_reversado: 150000,
    });
    expect(result.status).toBe("processed");
    expect(paymentApplicationService.recalcularCuota).toHaveBeenCalled();
    expect(paymentApplicationService.recalcularContrato).toHaveBeenCalled();
  });

  it("reversa duplicada no duplica", async () => {
    const integrationEventService = {
      ensureIdempotency: vi.fn().mockResolvedValue({
        event: { ...baseEvent(6), status: IntegrationEventStatus.PROCESSED },
        duplicated: true,
      }),
      markProcessed: vi.fn(),
      markFailed: vi.fn(),
    };
    const service = new PagaCuotasIntegrationService({} as never, {} as never, {
      integrationEventService: integrationEventService as never,
    });
    const result = await service.registerReversedPayment({
      external_reversal_id: "pc_reversal_1",
    });
    expect(result.status).toBe("idempotent");
  });

  it("reversa sin pago original queda pending_review", async () => {
    const integrationEventService = {
      ensureIdempotency: vi.fn().mockResolvedValue({
        event: baseEvent(8),
        duplicated: false,
      }),
      markProcessed: vi.fn(),
      markFailed: vi.fn().mockResolvedValue({}),
    };
    const externalReferenceService = {
      findByExternalId: vi.fn().mockResolvedValue(null),
    };
    const db = {
      pago: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    const service = new PagaCuotasIntegrationService(db as never, {} as never, {
      integrationEventService: integrationEventService as never,
      externalReferenceService: externalReferenceService as never,
    });
    const result = await service.registerReversedPayment({
      external_reversal_id: "pc_reversal_2",
      external_payment_id: "pc_payment_not_found",
    });
    expect(result.status).toBe("pending_review");
    expect(integrationEventService.markFailed).toHaveBeenCalled();
  });

  it("valida payment intent con monto exacto e idempotencia", async () => {
    const integrationEventService = {
      ensureIdempotency: vi.fn().mockResolvedValue({
        event: baseEvent(11),
        duplicated: false,
      }),
    };
    const db = {
      cliente: { findUnique: vi.fn().mockResolvedValue({ id: 1 }) },
      contrato: { findUnique: vi.fn().mockResolvedValue({ id: 10, cliente_id: 1 }) },
      cuota: {
        findMany: vi.fn().mockResolvedValue([
          { id: 100, contrato_id: 10, estado: EstadoCuota.PENDIENTE, saldo_pendiente: 60000 },
          { id: 101, contrato_id: 10, estado: EstadoCuota.VENCIDA, saldo_pendiente: 40000 },
        ]),
      },
    };
    const service = new PagaCuotasIntegrationService(db as never, {} as never, {
      integrationEventService: integrationEventService as never,
    });

    const result = await service.validatePaymentIntent({
      external_attempt_id: "attempt-1",
      cliente_id: 1,
      contrato_id: 10,
      cuota_ids: [100, 101],
      monto_total: 100000,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
