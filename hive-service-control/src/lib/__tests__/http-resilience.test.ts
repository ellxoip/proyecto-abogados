import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchWithRetry,
  fetchWithTimeout,
  HttpTimeoutError,
} from "@/lib/http-resilience";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers as Record<string, string> | undefined) },
  });
}

describe("fetchWithTimeout", () => {
  it("returns the response when fetch succeeds within timeout", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ ok: true })) as typeof fetch;
    const res = await fetchWithTimeout("http://example/x", {}, 500);
    expect(res.ok).toBe(true);
  });

  it("throws HttpTimeoutError on AbortError", async () => {
    globalThis.fetch = vi.fn(async (_url, init: RequestInit | undefined) => {
      // Simulate a hanging request that respects the AbortController.
      return await new Promise<Response>((resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        const timer = setTimeout(() => resolve(jsonResponse({ ok: true })), 5_000);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }) as typeof fetch;

    await expect(fetchWithTimeout("http://example/slow", {}, 50)).rejects.toBeInstanceOf(
      HttpTimeoutError,
    );
  });
});

describe("fetchWithRetry", () => {
  it("does not retry on 2xx", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ ok: true })) as typeof fetch;
    globalThis.fetch = fetchSpy;
    const res = await fetchWithRetry("http://example/x", {}, { attempts: 3 });
    expect(res.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 4xx (other than 408/425/429)", async () => {
    const fetchSpy = vi.fn(async () => new Response("bad", { status: 400 })) as typeof fetch;
    globalThis.fetch = fetchSpy;
    const res = await fetchWithRetry("http://example/x", {}, { attempts: 3 });
    expect(res.status).toBe(400);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries on 503 up to attempts", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      if (calls < 3) return new Response("retry", { status: 503 });
      return jsonResponse({ ok: true });
    }) as typeof fetch;

    const res = await fetchWithRetry(
      "http://example/x",
      {},
      { attempts: 3, baseDelayMs: 1, maxDelayMs: 5 },
    );
    expect(res.ok).toBe(true);
    expect(calls).toBe(3);
  });

  it("returns last response when all attempts exhausted", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      return new Response("nope", { status: 503 });
    }) as typeof fetch;

    const res = await fetchWithRetry(
      "http://example/x",
      {},
      { attempts: 2, baseDelayMs: 1, maxDelayMs: 5 },
    );
    expect(res.status).toBe(503);
    expect(calls).toBe(2);
  });

  it("retries on network error (TypeError)", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("fetch failed");
      return jsonResponse({ ok: true });
    }) as typeof fetch;

    const res = await fetchWithRetry(
      "http://example/x",
      {},
      { attempts: 3, baseDelayMs: 1, maxDelayMs: 5 },
    );
    expect(res.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("honors Retry-After header (seconds) on 429", async () => {
    let calls = 0;
    const t0 = Date.now();
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("rate", {
          status: 429,
          headers: { "retry-after": "0" },
        });
      }
      return jsonResponse({ ok: true });
    }) as typeof fetch;

    const res = await fetchWithRetry(
      "http://example/x",
      {},
      { attempts: 3, baseDelayMs: 1, maxDelayMs: 5 },
    );
    expect(res.ok).toBe(true);
    expect(calls).toBe(2);
    expect(Date.now() - t0).toBeLessThan(2_000);
  });
});
