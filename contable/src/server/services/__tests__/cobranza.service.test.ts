import { EstadoPago } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  inferEstadoCobranza,
  paymentReducesDebt,
  splitDebtByDueDate,
} from "../cobranza.service";

describe("cobranza.service rules", () => {
  it("deuda vencida y por vencer se calcula correctamente", () => {
    const now = new Date("2026-05-07");
    const debt = splitDebtByDueDate(
      [
        { saldo_pendiente: 100000, fecha_vencimiento: new Date("2026-05-01") },
        { saldo_pendiente: 50000, fecha_vencimiento: new Date("2026-05-07") },
        { saldo_pendiente: 80000, fecha_vencimiento: new Date("2026-06-01") },
      ],
      now,
    );

    expect(debt.deudaVencida).toBe(100000);
    expect(debt.deudaPorVencer).toBe(130000);
  });

  it("solo pagos confirmados reducen deuda", () => {
    expect(paymentReducesDebt(EstadoPago.CONFIRMADO)).toBe(true);
    expect(paymentReducesDebt(EstadoPago.REGISTRADO)).toBe(false);
    expect(paymentReducesDebt(EstadoPago.RECHAZADO)).toBe(false);
    expect(paymentReducesDebt(EstadoPago.REVERSADO)).toBe(false);
  });

  it("prioriza estado de compromiso incumplido y critico", () => {
    expect(
      inferEstadoCobranza({
        diasAtrasoMaximo: 10,
        cuotasVencidas: 1,
        hasGestion: true,
        compromisoActivo: false,
        compromisoIncumplido: true,
      }),
    ).toBe("COMPROMISO_INCUMPLIDO");

    expect(
      inferEstadoCobranza({
        diasAtrasoMaximo: 95,
        cuotasVencidas: 1,
        hasGestion: false,
        compromisoActivo: false,
        compromisoIncumplido: false,
      }),
    ).toBe("CRITICO");
  });

  it("marca moroso cuando hay vencidas", () => {
    expect(
      inferEstadoCobranza({
        diasAtrasoMaximo: 5,
        cuotasVencidas: 1,
        hasGestion: false,
        compromisoActivo: false,
        compromisoIncumplido: false,
      }),
    ).toBe("MOROSO");
  });
});
