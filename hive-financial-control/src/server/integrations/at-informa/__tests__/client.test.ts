import { afterEach, describe, expect, it, vi } from "vitest";
import { atInformaFetch, getAtInformaPlanPagos } from "../client";

const originalEnv = process.env;

describe("AT-INFORMA client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  it("construye URL y header Authorization Bearer", async () => {
    process.env = {
      ...originalEnv,
      AT_INFORMA_API_URL: "https://at-informa.cl",
      AT_INFORMA_API_KEY: "secret-token",
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await atInformaFetch("/api/v1/plan-pagos", { method: "GET" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://at-informa.cl/api/v1/plan-pagos",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer secret-token",
        }),
      }),
    );
  });

  it("maneja error 401", async () => {
    process.env = {
      ...originalEnv,
      AT_INFORMA_API_URL: "https://at-informa.cl",
      AT_INFORMA_API_KEY: "secret-token",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: async () => ({ error: "Invalid token" }),
      }) as unknown as typeof fetch,
    );

    await expect(atInformaFetch("/api/v1/plan-pagos")).rejects.toThrow(
      /401 Unauthorized: Invalid token/,
    );
  });

  it("valida respuesta con zod en plan-pagos", async () => {
    process.env = {
      ...originalEnv,
      AT_INFORMA_API_URL: "https://at-informa.cl",
      AT_INFORMA_API_KEY: "secret-token",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, planes: [] }),
      }) as unknown as typeof fetch,
    );

    const result = await getAtInformaPlanPagos();
    expect(result.success).toBe(true);
    expect(result.planes).toEqual([]);
  });
});
