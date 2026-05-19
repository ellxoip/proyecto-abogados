import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/integrations/pagacuotas/payment-intents/validate", () => {
  it("responde 401 sin credenciales internas", async () => {
    delete process.env.PAGACUOTAS_INTERNAL_API_KEY;
    delete process.env.PAGACUOTAS_INTERNAL_BEARER_TOKEN;
    const request = new Request("http://localhost/api/integrations/pagacuotas/payment-intents/validate", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("valida payload con API key", async () => {
    process.env.PAGACUOTAS_INTERNAL_API_KEY = "test-key";
    process.env.INTERNAL_API_KEY = "test-key";
    const request = new Request("http://localhost/api/integrations/pagacuotas/payment-intents/validate", {
      method: "POST",
      body: JSON.stringify({ external_attempt_id: "a-1" }),
      headers: { "content-type": "application/json", "x-api-key": "test-key" },
    });
    const response = await POST(request);
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(typeof body.valid).toBe("boolean");
  });
});
