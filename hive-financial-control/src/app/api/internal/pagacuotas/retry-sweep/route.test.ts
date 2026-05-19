import { describe, expect, it, vi, beforeEach } from "vitest";

const listPending = vi.fn();
const retryEvent = vi.fn();

vi.mock("@/server/services/integrations/pagacuotas-notify.service", () => ({
  PagaCuotasNotifyService: class {
    listPending = listPending;
    retryEvent = retryEvent;
  },
}));

import { POST, GET } from "./route";

const URL = "http://localhost/api/internal/pagacuotas/retry-sweep";

beforeEach(() => {
  listPending.mockReset();
  retryEvent.mockReset();
  delete process.env.PAGACUOTAS_INTERNAL_API_KEY;
  delete process.env.INTERNAL_API_KEY;
  delete process.env.PAGACUOTAS_INTERNAL_BEARER_TOKEN;
  delete process.env.INTERNAL_BEARER_TOKEN;
  delete process.env.CRON_SECRET;
});

describe("POST /api/internal/pagacuotas/retry-sweep — auth", () => {
  it("401 sin credenciales", async () => {
    listPending.mockResolvedValue([]);
    const res = await POST(new Request(URL, { method: "POST" }));
    expect(res.status).toBe(401);
    expect(listPending).not.toHaveBeenCalled();
  });

  it("200 con x-api-key (assertInternalApiAuth)", async () => {
    process.env.PAGACUOTAS_INTERNAL_API_KEY = "internal-key";
    listPending.mockResolvedValue([]);
    const res = await POST(
      new Request(URL, { method: "POST", headers: { "x-api-key": "internal-key" } }),
    );
    expect(res.status).toBe(200);
  });

  it("200 con Bearer CRON_SECRET (Vercel cron)", async () => {
    process.env.CRON_SECRET = "cron-shh";
    listPending.mockResolvedValue([]);
    const res = await POST(
      new Request(URL, {
        method: "POST",
        headers: { authorization: "Bearer cron-shh" },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("200 con x-cron-secret header", async () => {
    process.env.CRON_SECRET = "cron-shh";
    listPending.mockResolvedValue([]);
    const res = await POST(
      new Request(URL, {
        method: "POST",
        headers: { "x-cron-secret": "cron-shh" },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("401 con CRON_SECRET incorrecto y sin internal key", async () => {
    process.env.CRON_SECRET = "right";
    listPending.mockResolvedValue([]);
    const res = await POST(
      new Request(URL, {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/internal/pagacuotas/retry-sweep — sweep behavior", () => {
  beforeEach(() => {
    process.env.PAGACUOTAS_INTERNAL_API_KEY = "k";
  });

  it("sin eventos: summary cero", async () => {
    listPending.mockResolvedValue([]);
    const res = await POST(
      new Request(URL, { method: "POST", headers: { "x-api-key": "k" } }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      summary: {
        processed: 0,
        success: 0,
        stillPending: 0,
        failed: 0,
        dryRun: false,
        items: [],
      },
    });
    expect(retryEvent).not.toHaveBeenCalled();
  });

  it("evento que pasa a success", async () => {
    listPending.mockResolvedValue([{ id: 10, external_event_id: "99" }]);
    retryEvent.mockResolvedValueOnce({
      ok: true,
      status: "created",
      autoLoginUrl: "http://pc/auto/x",
      integrationEventId: 10,
    });
    const res = await POST(
      new Request(URL, { method: "POST", headers: { "x-api-key": "k" } }),
    );
    const body = await res.json();
    expect(body.summary.processed).toBe(1);
    expect(body.summary.success).toBe(1);
    expect(body.summary.stillPending).toBe(0);
    expect(body.summary.items).toEqual([
      { integrationEventId: 10, contratoId: "99", status: "success" },
    ]);
    expect(retryEvent).toHaveBeenCalledWith(10);
  });

  it("evento sigue pending tras retry (attempts < 8)", async () => {
    listPending.mockResolvedValue([{ id: 11, external_event_id: "100" }]);
    retryEvent.mockResolvedValueOnce({
      ok: false,
      status: "pending",
      integrationEventId: 11,
      attempts: 3,
      error: "503",
    });
    const res = await POST(
      new Request(URL, { method: "POST", headers: { "x-api-key": "k" } }),
    );
    const body = await res.json();
    expect(body.summary.stillPending).toBe(1);
    expect(body.summary.failed).toBe(0);
    expect(body.summary.items[0]).toMatchObject({
      integrationEventId: 11,
      status: "pending",
      attempts: 3,
      error: "503",
    });
  });

  it("evento que llega a max attempts (8) → failed", async () => {
    listPending.mockResolvedValue([{ id: 12, external_event_id: "101" }]);
    retryEvent.mockResolvedValueOnce({
      ok: false,
      status: "pending",
      integrationEventId: 12,
      attempts: 8,
      error: "still down",
    });
    const res = await POST(
      new Request(URL, { method: "POST", headers: { "x-api-key": "k" } }),
    );
    const body = await res.json();
    expect(body.summary.failed).toBe(1);
    expect(body.summary.stillPending).toBe(0);
    expect(body.summary.items[0].status).toBe("failed");
  });

  it("mix de success + pending + failed en un solo sweep", async () => {
    listPending.mockResolvedValue([
      { id: 1, external_event_id: "A" },
      { id: 2, external_event_id: "B" },
      { id: 3, external_event_id: "C" },
    ]);
    retryEvent
      .mockResolvedValueOnce({ ok: true, status: "created", autoLoginUrl: null, integrationEventId: 1 })
      .mockResolvedValueOnce({ ok: false, status: "pending", integrationEventId: 2, attempts: 2, error: "x" })
      .mockResolvedValueOnce({ ok: false, status: "pending", integrationEventId: 3, attempts: 8, error: "max" });

    const res = await POST(
      new Request(URL, { method: "POST", headers: { "x-api-key": "k" } }),
    );
    const body = await res.json();
    expect(body.summary).toMatchObject({
      processed: 3,
      success: 1,
      stillPending: 1,
      failed: 1,
    });
  });

  it("excepción en retryEvent se cuenta como failed sin tumbar el sweep", async () => {
    listPending.mockResolvedValue([
      { id: 1, external_event_id: "A" },
      { id: 2, external_event_id: "B" },
    ]);
    retryEvent
      .mockRejectedValueOnce(new Error("db connection lost"))
      .mockResolvedValueOnce({ ok: true, status: "created", autoLoginUrl: null, integrationEventId: 2 });

    const res = await POST(
      new Request(URL, { method: "POST", headers: { "x-api-key": "k" } }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.success).toBe(1);
    expect(body.summary.failed).toBe(1);
    expect(body.summary.items[0]).toMatchObject({
      integrationEventId: 1,
      status: "failed",
      error: "db connection lost",
    });
  });

  it("dryRun=true: marca items como skipped, NO invoca retryEvent", async () => {
    listPending.mockResolvedValue([
      { id: 1, external_event_id: "A" },
      { id: 2, external_event_id: "B" },
    ]);
    const res = await POST(
      new Request(URL, {
        method: "POST",
        headers: { "x-api-key": "k", "content-type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      }),
    );
    const body = await res.json();
    expect(body.summary.dryRun).toBe(true);
    expect(body.summary.processed).toBe(2);
    expect(body.summary.success).toBe(0);
    expect(body.summary.items.every((i: { status: string }) => i.status === "skipped")).toBe(true);
    expect(retryEvent).not.toHaveBeenCalled();
  });

  it("body con limit pasa el valor a listPending (clamp a 100 max)", async () => {
    listPending.mockResolvedValue([]);
    await POST(
      new Request(URL, {
        method: "POST",
        headers: { "x-api-key": "k", "content-type": "application/json" },
        body: JSON.stringify({ limit: 500 }),
      }),
    );
    expect(listPending).toHaveBeenCalledWith(100); // capped

    listPending.mockClear();
    await POST(
      new Request(URL, {
        method: "POST",
        headers: { "x-api-key": "k", "content-type": "application/json" },
        body: JSON.stringify({ limit: 5 }),
      }),
    );
    expect(listPending).toHaveBeenCalledWith(5);
  });
});

describe("GET /api/internal/pagacuotas/retry-sweep (Vercel Cron)", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret";
  });

  it("GET con Bearer CRON_SECRET ejecuta el sweep igual que POST", async () => {
    listPending.mockResolvedValue([{ id: 1, external_event_id: "X" }]);
    retryEvent.mockResolvedValueOnce({
      ok: true,
      status: "created",
      autoLoginUrl: null,
      integrationEventId: 1,
    });

    const res = await GET(
      new Request(URL, {
        method: "GET",
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.success).toBe(1);
  });

  it("GET sin auth → 401", async () => {
    listPending.mockResolvedValue([]);
    const res = await GET(new Request(URL, { method: "GET" }));
    expect(res.status).toBe(401);
  });
});
