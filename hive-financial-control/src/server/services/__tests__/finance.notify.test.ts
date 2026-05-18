import { EstadoCuota } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { notifyAtInformaPago, prismaMock } = vi.hoisted(() => ({
  notifyAtInformaPago: vi.fn(),
  prismaMock: {
    cuota: {
      findUnique: vi.fn(),
    },
    pago: {
      updateMany: vi.fn(),
    },
    externalSyncLog: {
      create: vi.fn(),
    },
    sistemaExterno: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/server/integrations/at-informa/client", () => ({
  notifyAtInformaPago,
}));

import { registerPayment } from "../finance.service";

function makeDb() {
  const cuotaRows = [
    {
      id: 101,
      contrato_id: 44,
      numero_cuota: 1,
      fecha_vencimiento: new Date("2026-05-01"),
      monto_original: 100,
      monto_actual: 100,
      monto_pagado: 0,
      saldo_pendiente: 100,
      estado: EstadoCuota.PENDIENTE,
    },
  ];

  const tx = {
    cuota: {
      findMany: vi.fn().mockResolvedValue(cuotaRows),
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue({}),
    },
    pago: {
      create: vi.fn().mockResolvedValue({ id: 1 }),
    },
    contrato: {
      update: vi.fn().mockResolvedValue({}),
    },
  };

  return {
    tx,
    db: {
      $transaction: async (fn: (arg0: typeof tx) => unknown) => fn(tx),
    },
  };
}

describe("registerPayment notify AT-INFORMA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.cuota.findUnique.mockResolvedValue({
      id: 101,
      numero_cuota: 1,
      monto_actual: 100,
      contrato: { external_id: "caso-ext-1" },
    });
    prismaMock.externalSyncLog.create.mockResolvedValue({ id: 1 });
    prismaMock.sistemaExterno.upsert.mockResolvedValue({ id: 1 });
  });

  it("al registrar pago local llama notifyAtInformaPago", async () => {
    notifyAtInformaPago.mockResolvedValue({ success: true });
    const { db } = makeDb();

    await registerPayment(
      {
        clienteId: 1,
        contratoId: 44,
        montoPagado: 100,
        fechaPago: new Date("2026-05-04"),
        medioPago: "transferencia",
      },
      db as never,
    );

    expect(notifyAtInformaPago).toHaveBeenCalledTimes(1);
    expect(prismaMock.externalSyncLog.create).not.toHaveBeenCalled();
  });

  it("si falla notifyAtInformaPago, el pago local permanece", async () => {
    notifyAtInformaPago.mockRejectedValue(new Error("AT-INFORMA down"));
    const { db, tx } = makeDb();

    await registerPayment(
      {
        clienteId: 1,
        contratoId: 44,
        montoPagado: 100,
        fechaPago: new Date("2026-05-04"),
        medioPago: "transferencia",
      },
      db as never,
    );

    expect(tx.pago.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.externalSyncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
  });
});
