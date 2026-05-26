import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetIdempotencyCacheForTests,
  getIdempotencyKey,
  withIdempotency,
} from "@/lib/idempotency";

beforeEach(() => {
  _resetIdempotencyCacheForTests();
});

function reqWith(headers: Record<string, string>) {
  return new Request("http://test/x", { method: "POST", headers });
}

describe("getIdempotencyKey", () => {
  it("returns header value when present", () => {
    expect(getIdempotencyKey(reqWith({ "idempotency-key": "abc-123" }))).toBe("abc-123");
  });
  it("returns null when absent", () => {
    expect(getIdempotencyKey(reqWith({}))).toBeNull();
  });
  it("returns null for empty header", () => {
    expect(getIdempotencyKey(reqWith({ "idempotency-key": "   " }))).toBeNull();
  });
  it("returns null for absurdly long header", () => {
    expect(getIdempotencyKey(reqWith({ "idempotency-key": "x".repeat(300) }))).toBeNull();
  });
});

describe("withIdempotency", () => {
  it("runs handler when key is null", async () => {
    const handler = vi.fn(async () => ({ status: 200, body: { ok: true } }));
    const res = await withIdempotency(null, handler);
    expect(handler).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
  });

  it("caches response by key (same key → handler runs once)", async () => {
    const handler = vi.fn(async () => ({ status: 200, body: { value: Math.random() } }));
    const first = await withIdempotency("k1", handler);
    const second = await withIdempotency("k1", handler);
    expect(handler).toHaveBeenCalledOnce();
    expect(second.body).toEqual(first.body);
  });

  it("distinguishes different keys", async () => {
    const handler = vi.fn(async () => ({ status: 200, body: {} }));
    await withIdempotency("k1", handler);
    await withIdempotency("k2", handler);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("expires entries after TTL", async () => {
    const handler = vi.fn(async () => ({ status: 200, body: {} }));
    await withIdempotency("k1", handler, { ttlMs: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await withIdempotency("k1", handler, { ttlMs: 1 });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("dedupes concurrent in-flight calls with same key", async () => {
    let resolveHandler: (() => void) | null = null;
    const handler = vi.fn(
      () =>
        new Promise<{ status: number; body: unknown }>((resolve) => {
          resolveHandler = () => resolve({ status: 200, body: { ok: true } });
        }),
    );

    const p1 = withIdempotency("k1", handler);
    const p2 = withIdempotency("k1", handler);
    expect(handler).toHaveBeenCalledOnce();

    resolveHandler!();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.body).toEqual(r2.body);
  });

  it("evicts oldest keys when over maxKeys", async () => {
    const handler = vi.fn(async (n: number) => ({ status: 200, body: { n } }));
    for (let i = 0; i < 5; i += 1) {
      await withIdempotency(`k${i}`, () => handler(i), { maxKeys: 3 });
    }
    // k0/k1 should be evicted; k4 should be cached.
    expect(handler).toHaveBeenCalledTimes(5);
    await withIdempotency("k0", () => handler(99), { maxKeys: 3 });
    // k0 ran again because it was evicted.
    expect(handler).toHaveBeenCalledTimes(6);
    await withIdempotency("k4", () => handler(99), { maxKeys: 3 });
    // k4 cached, did not call handler.
    expect(handler).toHaveBeenCalledTimes(6);
  });
});
