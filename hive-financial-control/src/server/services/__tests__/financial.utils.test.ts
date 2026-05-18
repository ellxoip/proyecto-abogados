import { EstadoContrato, EstadoCuota } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  applyPaymentToInstallments,
  buildRepactationPlan,
  calculateContractState,
  generateInstallmentPlan,
  selectInstallmentsToReplaceForRepactation,
} from "../financial.utils";

describe("Financial core logic", () => {
  it("crea contrato con pago inicial y 5 cuotas", () => {
    const montoContrato = 1_000_000;
    const pagoInicial = 500_000;
    const saldoFinanciado = montoContrato - pagoInicial;

    const cuotas = generateInstallmentPlan(
      saldoFinanciado,
      5,
      new Date("2026-05-05"),
    );

    expect(cuotas).toHaveLength(5);
    expect(cuotas[0].numero_cuota).toBe(1);
    expect(cuotas[4].numero_cuota).toBe(5);

    const totalCuotas = cuotas.reduce(
      (acc, item) => acc + Number(item.monto_actual),
      0,
    );
    expect(totalCuotas).toBe(saldoFinanciado);
  });

  it("aplica pago parcial a la cuota más antigua", () => {
    const now = new Date("2026-05-10");
    const installments = [
      {
        id: 1,
        fechaVencimiento: new Date("2026-05-05"),
        saldoPendiente: 100_000,
        montoPagado: 0,
      },
      {
        id: 2,
        fechaVencimiento: new Date("2026-06-05"),
        saldoPendiente: 100_000,
        montoPagado: 0,
      },
    ];

    const result = applyPaymentToInstallments(installments, 60_000, now);

    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].cuotaId).toBe(1);
    expect(result.allocations[0].montoAplicado).toBe(60_000);
    expect(result.allocations[0].saldoRestanteCuota).toBe(40_000);
    expect(result.abonoNoAplicado).toBe(0);
  });

  it("aplica pago que cubre varias cuotas", () => {
    const now = new Date("2026-05-10");
    const installments = [
      {
        id: 1,
        fechaVencimiento: new Date("2026-05-05"),
        saldoPendiente: 100_000,
        montoPagado: 0,
      },
      {
        id: 2,
        fechaVencimiento: new Date("2026-06-05"),
        saldoPendiente: 100_000,
        montoPagado: 0,
      },
      {
        id: 3,
        fechaVencimiento: new Date("2026-07-05"),
        saldoPendiente: 100_000,
        montoPagado: 0,
      },
    ];

    const result = applyPaymentToInstallments(installments, 250_000, now);

    expect(result.allocations).toHaveLength(3);
    expect(result.allocations[0].saldoRestanteCuota).toBe(0);
    expect(result.allocations[1].saldoRestanteCuota).toBe(0);
    expect(result.allocations[2].saldoRestanteCuota).toBe(50_000);
    expect(result.abonoNoAplicado).toBe(0);
  });

  it("marca contrato como pagado completamente", () => {
    const now = new Date("2026-09-10");
    const estado = calculateContractState(
      [
        {
          saldoPendiente: 0,
          fechaVencimiento: new Date("2026-05-05"),
        },
        {
          saldoPendiente: 0,
          fechaVencimiento: new Date("2026-06-05"),
        },
      ],
      now,
    );

    expect(estado).toBe(EstadoContrato.PAGADO);
  });

  it("repactación: selecciona solo cuotas futuras pendientes/parciales/reprogramadas", () => {
    const now = new Date("2026-05-10");
    const replaceables = selectInstallmentsToReplaceForRepactation(
      [
        {
          id: 1,
          fechaVencimiento: new Date("2026-05-05"),
          saldoPendiente: 100_000,
          estado: EstadoCuota.VENCIDA,
        },
        {
          id: 2,
          fechaVencimiento: new Date("2026-06-05"),
          saldoPendiente: 100_000,
          estado: EstadoCuota.PENDIENTE,
        },
        {
          id: 3,
          fechaVencimiento: new Date("2026-07-05"),
          saldoPendiente: 50_000,
          estado: EstadoCuota.PARCIAL,
        },
        {
          id: 4,
          fechaVencimiento: new Date("2026-08-05"),
          saldoPendiente: 0,
          estado: EstadoCuota.PENDIENTE,
        },
      ],
      now,
    );

    expect(replaceables.map((item) => item.id)).toEqual([2, 3]);
  });

  it("repactación: crea nuevas cuotas sobre saldo pendiente y continúa numeración", () => {
    const plan = buildRepactationPlan(
      300_000,
      3,
      new Date("2026-06-15"),
      5,
    );

    expect(plan).toHaveLength(3);
    expect(plan[0].numero_cuota).toBe(6);
    expect(plan[1].numero_cuota).toBe(7);
    expect(plan[2].numero_cuota).toBe(8);

    const total = plan.reduce((acc, cuota) => acc + Number(cuota.monto_actual), 0);
    expect(total).toBe(300_000);
  });
});
