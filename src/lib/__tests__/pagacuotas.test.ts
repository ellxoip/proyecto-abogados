import { describe, expect, it } from "vitest";
import { ensurePagaCuotasPaymentLink } from "@/lib/pagacuotas";

describe("ensurePagaCuotasPaymentLink", () => {
  it("returns the stored paymentLink when present", async () => {
    const link = "https://pagacuotas.cl/c/abc123";
    const result = await ensurePagaCuotasPaymentLink({ paymentLink: link });
    expect(result).toBe(link);
  });

  it("returns null when paymentLink is null", async () => {
    const result = await ensurePagaCuotasPaymentLink({ paymentLink: null });
    expect(result).toBeNull();
  });

  it("never reaches out to the network (no external POST)", async () => {
    // El helper debe ser puro: si no hay link guardado, devuelve null sin
    // hablar con pagacuotas (evita race + duplicación documentada en pagacuotas.ts).
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return new Response("nope", { status: 500 });
    }) as typeof fetch;

    try {
      await ensurePagaCuotasPaymentLink({ paymentLink: null });
      await ensurePagaCuotasPaymentLink({ paymentLink: "https://x.example/y" });
      expect(fetchCalled).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
