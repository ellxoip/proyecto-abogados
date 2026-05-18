import { describe, expect, it } from "vitest";
import { IntegrationEventStatus } from "@prisma/client";
import { IntegrationEventService } from "../integrations/integration-event.service";

function createFakeDb() {
  const events: Array<Record<string, unknown>> = [];
  let seq = 1;

  return {
    db: {
      sistemaExterno: {
        upsert: async () => ({ id: 1 }),
      },
      integrationEvent: {
        findUnique: async ({ where }: { where: { idempotency_key: string } }) =>
          events.find((event) => event.idempotency_key === where.idempotency_key) ?? null,
        findFirst: async ({
          where,
        }: {
          where: { event_type: string; external_event_id?: string };
        }) =>
          events.find(
            (event) =>
              event.event_type === where.event_type &&
              event.external_event_id === where.external_event_id,
          ) ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const record = {
            id: seq++,
            status: IntegrationEventStatus.PENDING,
            created_at: new Date(),
            updated_at: new Date(),
            ...data,
          };
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
          const idx = events.findIndex((item) => item.id === where.id);
          events[idx] = { ...events[idx], ...data };
          return events[idx];
        },
      },
    },
    events,
  };
}

describe("IntegrationEventService", () => {
  it("garantiza idempotencia por idempotency_key", async () => {
    const fake = createFakeDb();
    const service = new IntegrationEventService(fake.db as never);

    const first = await service.ensureIdempotency({
      systemCode: "PAGACUOTAS",
      eventType: "payments.confirmed",
      externalEventId: "evt-1",
      idempotencyKey: "idem-1",
      payload: { ok: true },
    });

    const second = await service.ensureIdempotency({
      systemCode: "PAGACUOTAS",
      eventType: "payments.confirmed",
      externalEventId: "evt-1",
      idempotencyKey: "idem-1",
      payload: { ok: true },
    });

    expect(first.duplicated).toBe(false);
    expect(second.duplicated).toBe(true);
    expect(fake.events).toHaveLength(1);
  });
});
