import { describe, expect, it, vi, beforeEach } from "vitest";
import { IntegrationEventStatus } from "@prisma/client";
import { CrmIntegrationService } from "../integrations/crm-integration.service";

function buildFakeDb() {
  return {
    cliente: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: 42,
        rut: "12345678-9",
        nombre: "Cliente Test",
        email: "test@example.com",
      }),
    },
    contrato: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => {
      let cuotaSeq = 1000;
      const tx = {
        contrato: {
          create: vi.fn().mockResolvedValue({ id: 99, cliente_id: 42 }),
        },
        cuota: {
          create: vi.fn(async () => ({ id: cuotaSeq++ })),
        },
      };
      return cb(tx);
    }),
  };
}

function buildMocks(scheduleClientCreationImpl?: () => unknown) {
  const integrationEventService = {
    ensureIdempotency: vi.fn().mockResolvedValue({
      event: { id: 1, status: IntegrationEventStatus.PENDING, result_payload: null },
      duplicated: false,
    }),
    markProcessed: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  };

  const externalReferenceService = {
    upsertReference: vi.fn().mockResolvedValue({}),
    ensureSystem: vi.fn().mockResolvedValue(1),
    findByExternalId: vi.fn().mockResolvedValue(null),
    findByEntity: vi.fn().mockResolvedValue(null),
  };

  const pagaCuotasNotifyService = {
    scheduleClientCreation: scheduleClientCreationImpl
      ? vi.fn().mockImplementation(scheduleClientCreationImpl)
      : vi.fn().mockResolvedValue({
          ok: true,
          status: "created",
          autoLoginUrl: "http://pc/auto/xyz",
          portalUrl: "http://pc/client/login?identifier=12345678-9",
          paymentLink: "http://pc/auto/xyz",
          integrationEventId: 5,
        }),
  };

  return { integrationEventService, externalReferenceService, pagaCuotasNotifyService };
}

const rawPayload = {
  event_id: "evt-1",
  correlation_id: "corr-1",
  idempotency_key: "test-key-1",
  payload: {
    lead_id: "lead-7",
    opportunity_id: "opp-9",
    customer: {
      full_name: "Cliente Test",
      tax_id: "12.345.678-9",
      email: "test@example.com",
      phone: "+56911111111",
    },
    proposal: {
      service_name: "TRIBUTARIO",
      initial_fee_amount: 100000,
      total_amount: 500000,
      installments_count: 5,
      first_due_date: "2026-06-01",
    },
  },
};

describe("CrmIntegrationService.handleOpportunityAccepted — hook a PagaCuotas", () => {
  let fakeDb: ReturnType<typeof buildFakeDb>;

  beforeEach(() => {
    fakeDb = buildFakeDb();
  });

  it("invoca scheduleClientCreation con payload correcto tras crear contrato", async () => {
    const mocks = buildMocks();
    const service = new CrmIntegrationService(fakeDb as never, mocks as never);

    const result = await service.handleOpportunityAccepted(rawPayload);

    expect(result.ok).toBe(true);
    expect(result.status).toBe("created");
    expect(result.clienteId).toBe(42);
    expect(result.contratoId).toBe(99);

    expect(mocks.pagaCuotasNotifyService.scheduleClientCreation).toHaveBeenCalledTimes(1);
    expect(mocks.pagaCuotasNotifyService.scheduleClientCreation).toHaveBeenCalledWith({
      clienteId: 42,
      contratoId: 99,
      rut: "12345678-9",
      nombre: "Cliente Test",
      email: "test@example.com",
      telefono: "+56911111111",
      crmLeadId: 7,
      correlationId: "corr-1",
    });
  });

  it("incluye resultado de PagaCuotas en result.pagacuotas (success)", async () => {
    const mocks = buildMocks();
    const service = new CrmIntegrationService(fakeDb as never, mocks as never);

    const result = await service.handleOpportunityAccepted(rawPayload);

    expect(result.pagacuotas).toEqual({
      status: "created",
      autoLoginUrl: "http://pc/auto/xyz",
      portalUrl: "http://pc/client/login?identifier=12345678-9",
      paymentLink: "http://pc/auto/xyz",
    });
  });

  it("NO falla onboarding cuando PagaCuotas notify retorna pending (caída temporal)", async () => {
    const mocks = buildMocks(async () => ({
      ok: false,
      status: "pending",
      integrationEventId: 5,
      attempts: 1,
      error: "ECONNREFUSED",
    }));
    const service = new CrmIntegrationService(fakeDb as never, mocks as never);

    const result = await service.handleOpportunityAccepted(rawPayload);

    expect(result.ok).toBe(true); // onboarding sigue OK
    expect(result.status).toBe("created");
    expect(result.pagacuotas).toEqual({
      status: "pending",
      attempts: 1,
      error: "ECONNREFUSED",
    });
  });

  it("NO falla onboarding si scheduleClientCreation lanza excepción inesperada", async () => {
    const mocks = buildMocks(async () => {
      throw new Error("unexpected boom");
    });
    const service = new CrmIntegrationService(fakeDb as never, mocks as never);

    const result = await service.handleOpportunityAccepted(rawPayload);

    expect(result.ok).toBe(true);
    expect(result.pagacuotas).toEqual({
      status: "pending",
      attempts: 0,
      error: "unexpected boom",
    });
  });

  it("marca PROCESSED el evento CRM con el resultado completo incluyendo pagacuotas", async () => {
    const mocks = buildMocks();
    const service = new CrmIntegrationService(fakeDb as never, mocks as never);

    await service.handleOpportunityAccepted(rawPayload);

    expect(mocks.integrationEventService.markProcessed).toHaveBeenCalledTimes(1);
    const [, resultPayload] = mocks.integrationEventService.markProcessed.mock.calls[0];
    expect(resultPayload).toMatchObject({
      clienteId: 42,
      contratoId: 99,
      status: "created",
      pagacuotas: {
        status: "created",
        autoLoginUrl: "http://pc/auto/xyz",
        portalUrl: "http://pc/client/login?identifier=12345678-9",
        paymentLink: "http://pc/auto/xyz",
      },
    });
  });

  it("NO invoca scheduleClientCreation cuando el evento es duplicado PROCESSED (idempotencia)", async () => {
    const mocks = buildMocks();
    mocks.integrationEventService.ensureIdempotency = vi.fn().mockResolvedValue({
      event: {
        id: 1,
        status: IntegrationEventStatus.PROCESSED,
        result_payload: { clienteId: 42, contratoId: 99, cuotaIds: [1000] },
      },
      duplicated: true,
    });
    const service = new CrmIntegrationService(fakeDb as never, mocks as never);

    const result = await service.handleOpportunityAccepted(rawPayload);

    expect(result.status).toBe("idempotent");
    expect(mocks.pagaCuotasNotifyService.scheduleClientCreation).not.toHaveBeenCalled();
  });
});
