import { describe, expect, it } from "vitest";
import { buildAtInformaPaymentPayload } from "../integrations/pagacuotas-sync-payload";

describe("buildAtInformaPaymentPayload", () => {
  it("prioriza payment_event_id cuando existe", () => {
    const payload = buildAtInformaPaymentPayload({
      monto: 120000,
      paidAt: new Date("2026-05-05"),
      referencia: "REF-1",
      paymentEventId: "evt-123",
      casoExternalId: "caso-99",
      numeroCuota: 3,
    });

    expect(payload.payment_event_id).toBe("evt-123");
    expect(payload.caso_id).toBeUndefined();
    expect(payload.numero_cuota).toBeUndefined();
  });

  it("usa caso_id + numero_cuota si no hay payment_event_id", () => {
    const payload = buildAtInformaPaymentPayload({
      monto: 45000,
      paidAt: new Date("2026-05-05"),
      referencia: "REF-2",
      casoExternalId: "caso-22",
      numeroCuota: 5,
    });

    expect(payload.caso_id).toBe("caso-22");
    expect(payload.numero_cuota).toBe(5);
  });

  it("falla si falta fallback requerido", () => {
    expect(() =>
      buildAtInformaPaymentPayload({
        monto: 45000,
        paidAt: new Date("2026-05-05"),
        referencia: "REF-2",
      }),
    ).toThrow();
  });
});
