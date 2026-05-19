import { EstadoContrato, EstadoCuota } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { PaymentPortalService } from "../integrations/payment-portal.service";

describe("PaymentPortalService", () => {
  it("retorna deudas por identifier de cliente", async () => {
    const db = {
      cliente: {
        findUnique: async ({ where }: { where: { rut?: string; id?: number } }) => {
          if (where.rut === "12345678-9" || where.id === 7) {
            return { id: 7, rut: "12345678-9", nombre: "Cliente Demo" };
          }
          return null;
        },
      },
      externalReference: {
        findFirst: async () => null,
      },
      contrato: {
        findMany: async () => [
          {
            id: 10,
            tipo_servicio: "Cobranza",
            estado: EstadoContrato.ACTIVO,
            cuotas: [
              {
                id: 100,
                numero_cuota: 1,
                fecha_vencimiento: new Date("2026-06-10"),
                monto_actual: 50000,
                saldo_pendiente: 50000,
                estado: EstadoCuota.PENDIENTE,
                cobrable: true,
              },
              {
                id: 101,
                numero_cuota: 2,
                fecha_vencimiento: new Date("2026-07-10"),
                monto_actual: 50000,
                saldo_pendiente: 30000,
                estado: EstadoCuota.PARCIAL,
                cobrable: true,
              },
            ],
          },
        ],
      },
    };

    const service = new PaymentPortalService(db as never);
    const result = await service.getDeudasByIdentifier("12345678-9");

    expect(result.cliente.id).toBe(7);
    expect(result.total_deuda).toBe(80000);
    expect(result.contratos).toHaveLength(1);
    expect(result.contratos[0].cuotas).toHaveLength(2);
  });

  it("retorna cuotas ordenadas y puede_pagar false para pagadas", async () => {
    const db = {
      cliente: { findUnique: async () => null },
      externalReference: { findFirst: async () => null },
      contrato: {
        findUnique: async ({ where }: { where: { id: number } }) => {
          if (where.id !== 10) return null;
          return {
            id: 10,
            external_id: "AT-2026-0001",
            estado: EstadoContrato.ACTIVO,
            monto_ccto: 300000,
            cuotas: [
              {
                id: 1,
                numero_cuota: 1,
                fecha_vencimiento: new Date("2026-06-10"),
                monto_original: 100000,
                monto_actual: 100000,
                monto_pagado: 0,
                saldo_pendiente: 100000,
                estado: EstadoCuota.VENCIDA,
                cobrable: true,
              },
              {
                id: 3,
                numero_cuota: 3,
                fecha_vencimiento: new Date("2026-08-10"),
                monto_original: 100000,
                monto_actual: 100000,
                monto_pagado: 100000,
                saldo_pendiente: 0,
                estado: EstadoCuota.PAGADA,
                cobrable: true,
              },
            ],
          };
        },
      },
      sistemaExterno: { upsert: async () => ({ id: 1 }) },
    };

    const service = new PaymentPortalService(db as never);
    const result = await service.getCuotasByContrato("10");

    expect(result.cuotas[0].numero_cuota).toBe(1);
    expect(result.cuotas[1].numero_cuota).toBe(3);
    expect(result.cuotas.find((c) => c.estado === "pagada")?.puede_pagar).toBe(false);
  });

  it("lanza error cuando contrato no existe", async () => {
    const db = {
      cliente: { findUnique: async () => null },
      externalReference: { findFirst: async () => null },
      contrato: {
        findUnique: async () => null,
      },
      sistemaExterno: { upsert: async () => ({ id: 1 }) },
    };

    const service = new PaymentPortalService(db as never);
    await expect(service.getCuotasByContrato("999")).rejects.toThrow("Contrato no encontrado.");
  });

  it("cuota no cobrable no queda pagable en PagaCuotas", async () => {
    const db = {
      cliente: { findUnique: async () => null },
      externalReference: { findFirst: async () => null },
      contrato: {
        findUnique: async ({ where }: { where: { id: number } }) => {
          if (where.id !== 10) return null;
          return {
            id: 10,
            external_id: "AT-2026-0001",
            estado: EstadoContrato.ACTIVO,
            monto_ccto: 300000,
            cuotas: [
              {
                id: 1,
                numero_cuota: 1,
                fecha_vencimiento: new Date("2026-06-10"),
                monto_original: 100000,
                monto_actual: 100000,
                monto_pagado: 0,
                saldo_pendiente: 100000,
                estado: EstadoCuota.PENDIENTE,
                cobrable: false,
              },
            ],
          };
        },
      },
      sistemaExterno: { upsert: async () => ({ id: 1 }) },
    };

    const service = new PaymentPortalService(db as never);
    const result = await service.getCuotasByContrato("10");
    expect(result.cuotas[0].puede_pagar).toBe(false);
  });

  it("resuelve deudas internas por email o id", async () => {
    const db = {
      cliente: {
        findUnique: async ({ where }: { where: { rut?: string; id?: number } }) => {
          if (where.id === 77) {
            return { id: 77, rut: "11111111-1", nombre: "Cliente", email: "demo@x.cl" };
          }
          return null;
        },
      },
      externalReference: {
        findFirst: async () => ({ entity_id: 77 }),
      },
      contrato: {
        findMany: async () => [
          {
            id: 9,
            tipo_servicio: "Servicio",
            estado: EstadoContrato.ACTIVO,
            cuotas: [
              { estado: EstadoCuota.PAGADA, saldo_pendiente: 0 },
              { estado: EstadoCuota.VENCIDA, saldo_pendiente: 1000 },
            ],
          },
        ],
      },
    };

    const service = new PaymentPortalService(db as never);
    const result = await service.getInternalDeudaSummary("demo@x.cl");
    expect(result.cliente.id).toBe(77);
    expect(result.total_cuotas).toBe(2);
    expect(result.cuotas_pagadas).toBe(1);
    expect(result.monto_vencido).toBe(1000);
  });
});
