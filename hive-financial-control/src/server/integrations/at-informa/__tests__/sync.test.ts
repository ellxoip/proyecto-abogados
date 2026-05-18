import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAtInformaPlanPagos, prismaMock } = vi.hoisted(() => ({
  getAtInformaPlanPagos: vi.fn(),
  prismaMock: {
    cliente: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    contrato: {
      upsert: vi.fn(),
    },
    cuota: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    externalSyncLog: {
      create: vi.fn(),
    },
    sistemaExterno: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("../client", () => ({
  getAtInformaPlanPagos,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { syncAtInformaPlanPagos } from "../sync";

const apiPlan = {
  success: true,
  planes: [
    {
      cliente: { id: "cli-1", rut: "123", nombre: "Juan", email: "juan@a.cl", telefono: "+569" },
      caso: { id: "caso-1", codigo: "AT-1", categoria: "TRIBUTARIO", boleta_inicial: "BL-1" },
      contrato: {
        ccto: 1000,
        pago_inicial: 200,
        saldo_financiado: 800,
        cantidad_cuotas: 2,
        total_pagado: 200,
        saldo_pendiente: 800,
        saldo_vencido: 0,
      },
      cuotas: [
        {
          id: "cuota-ext-1",
          numero_cuota: 1,
          fecha_vencimiento: "2026-05-05T00:00:00.000Z",
          monto: 400,
          monto_pagado: 0,
          saldo_pendiente: 400,
          estado: "UNPAID",
          pagado_en: null,
        },
      ],
    },
  ],
};

describe("syncAtInformaPlanPagos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAtInformaPlanPagos.mockResolvedValue(apiPlan);

    prismaMock.cliente.findUnique.mockResolvedValue(null);
    prismaMock.cliente.upsert.mockResolvedValue({ id: 10 });
    prismaMock.contrato.upsert.mockResolvedValue({ id: 20 });
    prismaMock.cuota.findUnique.mockResolvedValue(null);
    prismaMock.cuota.create.mockResolvedValue({ id: 30 });
    prismaMock.externalSyncLog.create.mockResolvedValue({ id: 1 });
    prismaMock.sistemaExterno.upsert.mockResolvedValue({ id: 1 });
  });

  it("crea cliente, contrato y cuotas y log SUCCESS", async () => {
    const result = await syncAtInformaPlanPagos();

    expect(result.planesProcesados).toBe(1);
    expect(result.clientesUpserted).toBe(1);
    expect(result.contratosUpserted).toBe(1);
    expect(result.cuotasUpserted).toBe(1);
    expect(prismaMock.externalSyncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUCCESS" }) }),
    );
  });

  it("si ya existe cuota, actualiza y no crea duplicado", async () => {
    prismaMock.cuota.findUnique.mockResolvedValueOnce({ id: 30, estado: "PENDIENTE" });

    await syncAtInformaPlanPagos();

    expect(prismaMock.cuota.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.cuota.create).toHaveBeenCalledTimes(0);
  });

  it("crea log ERROR cuando falla API", async () => {
    getAtInformaPlanPagos.mockRejectedValueOnce(new Error("401 Unauthorized"));

    await expect(syncAtInformaPlanPagos()).rejects.toThrow("401 Unauthorized");
    expect(prismaMock.externalSyncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
  });
});
