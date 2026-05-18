import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { PaymentPortalService } from "@/server/services/integrations/payment-portal.service";

describe("GET /api/public/payment-portal/contratos/:contratoId/cuotas", () => {
  it("retorna 404 cuando el contrato no existe", async () => {
    const spy = vi
      .spyOn(PaymentPortalService.prototype, "getCuotasByContrato")
      .mockRejectedValueOnce(new Error("Contrato no encontrado."));

    const response = await GET({} as never, {
      params: Promise.resolve({ contratoId: "999" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.ok).toBe(false);
    spy.mockRestore();
  });
});
