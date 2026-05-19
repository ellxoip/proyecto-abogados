import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationEventStatus } from "@prisma/client";

// Env vars must be set BEFORE the module import so module-level constants pick them up.
process.env.PAGACUOTAS_API_URL = "http://pagacuotas.test";
process.env.PAGACUOTAS_CRM_API_KEY = "test-crm-key";

const { PagaCuotasNotifyService } = await import("../integrations/pagacuotas-notify.service");

type Event = {
  id: number;
  status: string;
  event_type: string;
  external_event_id: string | null;
  idempotency_key: string;
  payload: unknown;
  result_payload: unknown;
  error_message: string | null;
  processed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  sistema_externo_id: number;
};

function createFakeDb() {
  const events: Event[] = [];
  let seq = 1;

  const db = {
    sistemaExterno: {
      upsert: async () => ({ id: 1, codigo: "PAGACUOTAS" }),
    },
    integrationEvent: {
      findUnique: async ({ where }: { where: { idempotency_key?: string; id?: number } }) => {
        if (where.idempotency_key)
          return events.find((e) => e.idempotency_key === where.idempotency_key) ?? null;
        if (where.id != null) return events.find((e) => e.id === where.id) ?? null;
        return null;
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        return (
          events.find((e) => {
            if (where.event_type && e.event_type !== where.event_type) return false;
            if (where.external_event_id && e.external_event_id !== where.external_event_id)
              return false;
            return true;
          }) ?? null
        );
      },
      findMany: async ({ where, take }: { where: Record<string, unknown>; take?: number }) => {
        const filtered = events.filter((e) => {
          if (where.status && e.status !== where.status) return false;
          if (where.event_type && e.event_type !== where.event_type) return false;
          return true;
        });
        return take ? filtered.slice(0, take) : filtered;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const record: Event = {
          id: seq++,
          status: IntegrationEventStatus.PENDING,
          event_type: data.event_type as string,
          external_event_id: (data.external_event_id as string | null) ?? null,
          idempotency_key: data.idempotency_key as string,
          payload: data.payload,
          result_payload: null,
          error_message: null,
          processed_at: null,
          created_at: new Date(),
          updated_at: new Date(),
          sistema_externo_id: 1,
          ...data,
        } as Event;
        events.push(record);
        return record;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: number };
        data: Record<string, unknown>;
      }) => {
        const idx = events.findIndex((e) => e.id === where.id);
        events[idx] = { ...events[idx], ...data, updated_at: new Date() } as Event;
        return events[idx];
      },
    },
  };

  return { db, events };
}

const samplePayload = {
  clienteId: 10,
  contratoId: 99,
  rut: "12345678-9",
  nombre: "Cliente Test",
  email: "test@example.com",
  telefono: "+56911111111",
};

describe("PagaCuotasNotifyService", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marca PROCESSED en éxito y retorna autoLoginUrl", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ autoLoginUrl: "http://pc/auto/abc" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const fake = createFakeDb();
    const service = new PagaCuotasNotifyService(fake.db as never);

    const result = await service.scheduleClientCreation(samplePayload);

    expect(result.ok).toBe(true);
    expect(result.status).toBe("created");
    expect("autoLoginUrl" in result && result.autoLoginUrl).toBe("http://pc/auto/abc");
    expect(fake.events).toHaveLength(1);
    expect(fake.events[0].status).toBe(IntegrationEventStatus.PROCESSED);
    expect((fake.events[0].result_payload as { attempts: number }).attempts).toBe(1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://pagacuotas.test/api/integration/clients/from-crm");
    expect((init as RequestInit).method).toBe("POST");
    expect(((init as RequestInit).headers as Record<string, string>)["x-crm-api-key"]).toBe(
      "test-crm-key",
    );
  });

  it("si viene crmLeadId genera clave temporal y notifica a NEXIO", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ autoLoginUrl: "http://pc/auto/abc" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const fake = createFakeDb();
    const paymentPortalService = {
      ensurePortalCredentials: vi.fn().mockResolvedValue({
        password: "ABC123",
        cliente: { id: 10, rut: "12345678-9" },
      }),
    };
    const crmClient = {
      configured: true,
      notifyPagaCuotasReady: vi.fn().mockResolvedValue(undefined),
    };
    const atInformaClient = {
      syncPaymentLink: vi.fn().mockResolvedValue({ ok: true, clientId: "client-1" }),
    };
    const service = new PagaCuotasNotifyService(
      fake.db as never,
      undefined as never,
      paymentPortalService as never,
      crmClient as never,
      atInformaClient as never,
    );

    const result = await service.scheduleClientCreation({
      ...samplePayload,
      crmLeadId: 7,
      correlationId: "corr-1",
    });

    expect(result.ok).toBe(true);
    expect(paymentPortalService.ensurePortalCredentials).toHaveBeenCalledWith(10);
    expect(atInformaClient.syncPaymentLink).toHaveBeenCalledWith({
      rut: "12345678-9",
      nombre: "Cliente Test",
      email: "test@example.com",
      telefono: "+56911111111",
      payment_link: "http://pc/auto/abc",
      password_plain: "ABC123",
      crm_lead_id: 7,
      correlation_id: "corr-1",
    });
    expect(crmClient.notifyPagaCuotasReady).toHaveBeenCalledWith({
      crmLeadId: 7,
      contratoId: 99,
      clienteId: 10,
      identifier: "12345678-9",
      portalUrl: "http://localhost:3002/client/login?identifier=12345678-9",
      paymentLink: "http://pc/auto/abc",
      autoLoginUrl: "http://pc/auto/abc",
      password: "ABC123",
      correlationId: "corr-1",
    });
    expect(fake.events[0].result_payload).toMatchObject({ passwordPlain: "ABC123" });
  });

  it("es idempotente: re-llamada con event PROCESSED no invoca fetch", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ autoLoginUrl: "http://pc/auto/1" }), { status: 200 }),
    );
    const fake = createFakeDb();
    const service = new PagaCuotasNotifyService(fake.db as never);

    await service.scheduleClientCreation(samplePayload);
    fetchMock.mockClear();

    const second = await service.scheduleClientCreation(samplePayload);

    expect(second.ok).toBe(true);
    expect(second.status).toBe("idempotent");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fake.events).toHaveLength(1);
  });

  it("network error → status pending, attempts=1, evento PENDING con result_payload", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const fake = createFakeDb();
    const service = new PagaCuotasNotifyService(fake.db as never);

    const result = await service.scheduleClientCreation(samplePayload);

    expect(result.ok).toBe(false);
    expect(result.status).toBe("pending");
    expect("attempts" in result && result.attempts).toBe(1);
    expect("error" in result && result.error).toMatch(/ECONNREFUSED/);

    expect(fake.events[0].status).toBe(IntegrationEventStatus.PENDING);
    const rp = fake.events[0].result_payload as { attempts: number; last_error: string };
    expect(rp.attempts).toBe(1);
    expect(rp.last_error).toMatch(/ECONNREFUSED/);
  });

  it("HTTP 503 → pending; retryEvent incrementa attempts", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("upstream down", { status: 503 }))
      .mockResolvedValueOnce(new Response("still down", { status: 503 }));
    const fake = createFakeDb();
    const service = new PagaCuotasNotifyService(fake.db as never);

    const first = await service.scheduleClientCreation(samplePayload);
    expect(first.ok).toBe(false);
    expect("attempts" in first && first.attempts).toBe(1);

    const eventId = first.integrationEventId;
    const second = await service.retryEvent(eventId);
    expect(second.ok).toBe(false);
    expect("attempts" in second && second.attempts).toBe(2);

    const ev = fake.events.find((e) => e.id === eventId)!;
    expect(ev.status).toBe(IntegrationEventStatus.PENDING);
    expect((ev.result_payload as { attempts: number }).attempts).toBe(2);
  });

  it("max attempts (8) → marca FAILED", async () => {
    fetchMock.mockResolvedValue(new Response("down", { status: 500 }));
    const fake = createFakeDb();
    const service = new PagaCuotasNotifyService(fake.db as never);

    const first = await service.scheduleClientCreation(samplePayload);
    const eventId = first.integrationEventId;

    // attempts goes 1 (above) → 2 → 3 → ... → 8
    for (let i = 0; i < 7; i++) {
      await service.retryEvent(eventId);
    }

    const ev = fake.events.find((e) => e.id === eventId)!;
    expect(ev.status).toBe(IntegrationEventStatus.FAILED);
    expect(ev.error_message).toMatch(/Max retries \(8\)/);
  });

  it("retryEvent con event ya PROCESSED retorna idempotent sin fetch", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ autoLoginUrl: "http://pc/url" }), { status: 200 }),
    );
    const fake = createFakeDb();
    const service = new PagaCuotasNotifyService(fake.db as never);

    const first = await service.scheduleClientCreation(samplePayload);
    fetchMock.mockClear();

    const retry = await service.retryEvent(first.integrationEventId);
    expect(retry.ok).toBe(true);
    expect(retry.status).toBe("idempotent");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listPending devuelve solo eventos en estado PENDING", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockRejectedValueOnce(new Error("fail"));
    const fake = createFakeDb();
    const service = new PagaCuotasNotifyService(fake.db as never);

    await service.scheduleClientCreation(samplePayload); // PROCESSED
    await service.scheduleClientCreation({ ...samplePayload, contratoId: 100 }); // PENDING

    const pending = await service.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].external_event_id).toBe("100");
  });
});
