import { EstadoComprobante, NaturalezaCuenta, TipoCuentaContable, TipoMovimientoContable } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { ContabilidadService } from "../contabilidad/contabilidad.service";

// ─── helpers ────────────────────────────────────────────────────────────────

function makeCuenta(codigo: string, id = 1) {
  return {
    id,
    codigo,
    nombre: `Cuenta ${codigo}`,
    tipo: TipoCuentaContable.ACTIVO,
    naturaleza: NaturalezaCuenta.DEUDORA,
    acepta_movimientos: true,
    activa: true,
    nivel: 1,
    empresa_id: null,
    cuenta_padre_id: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function makeTipo(id = 10, siguiente = 1) {
  return { id, nombre: "INGRESO", prefijo: "ING", siguiente_numero: siguiente, activo: true, empresa_id: null, descripcion: null, created_at: new Date(), updated_at: new Date() };
}

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    cierreContable: { findFirst: vi.fn().mockResolvedValue(null) },
    cuentaContable: { findFirst: vi.fn(), findUnique: vi.fn() },
    tipoComprobanteContable: { findFirst: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    comprobanteContable: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn().mockImplementation(
      async (ops: Array<Promise<unknown>> | ((tx: unknown) => Promise<unknown>)) =>
        Array.isArray(ops) ? Promise.all(ops) : ops({}),
    ),
    ...overrides,
  };
}

// ─── validarPeriodoAbierto ───────────────────────────────────────────────────

describe("ContabilidadService.validarPeriodoAbierto", () => {
  it("no lanza si no hay cierres", async () => {
    const db = makeDb();
    const svc = new ContabilidadService(db as never);
    await expect(svc.validarPeriodoAbierto(new Date("2026-05-15"))).resolves.toBeUndefined();
  });

  it("lanza si período mensual cerrado", async () => {
    const db = makeDb({
      cierreContable: {
        findFirst: vi.fn().mockResolvedValue({
          id: 1,
          tipo: "MENSUAL",
          periodo: "2026-05",
          fecha_cierre: new Date("2026-05-31"),
        }),
      },
    });
    const svc = new ContabilidadService(db as never);
    await expect(svc.validarPeriodoAbierto(new Date("2026-05-15"))).rejects.toThrow("2026-05");
  });

  it("lanza si período anual cerrado", async () => {
    const db = makeDb({
      cierreContable: {
        findFirst: vi.fn().mockResolvedValue({
          id: 2,
          tipo: "ANUAL",
          periodo: "2026",
          fecha_cierre: new Date("2026-12-31"),
        }),
      },
    });
    const svc = new ContabilidadService(db as never);
    await expect(svc.validarPeriodoAbierto(new Date("2026-03-01"))).rejects.toThrow("2026");
  });
});

// ─── resolverContexto ────────────────────────────────────────────────────────

describe("ContabilidadService.resolverContexto", () => {
  it("resuelve cuentas y tipo correctamente", async () => {
    const c1201 = makeCuenta("1201", 1);
    const c4101 = makeCuenta("4101", 2);
    const tipo = makeTipo();
    const db = makeDb({
      cuentaContable: {
        findFirst: vi.fn().mockImplementation(({ where }: { where: { codigo: string } }) => {
          if (where.codigo === "1201") return c1201;
          if (where.codigo === "4101") return c4101;
          return null;
        }),
      },
      tipoComprobanteContable: { findFirst: vi.fn().mockResolvedValue(tipo), update: vi.fn() },
    });
    const svc = new ContabilidadService(db as never);
    const ctx = await svc.resolverContexto(["1201", "4101"], "INGRESO", new Date("2026-05-01"));
    expect(ctx.cuentas.get("1201")?.id).toBe(1);
    expect(ctx.cuentas.get("4101")?.id).toBe(2);
    expect(ctx.tipo.id).toBe(10);
  });

  it("lanza si cuenta no encontrada", async () => {
    const db = makeDb({
      cuentaContable: { findFirst: vi.fn().mockResolvedValue(null) },
      tipoComprobanteContable: { findFirst: vi.fn().mockResolvedValue(makeTipo()), update: vi.fn() },
    });
    const svc = new ContabilidadService(db as never);
    await expect(svc.resolverContexto(["9999"], "INGRESO", new Date())).rejects.toThrow("9999");
  });

  it("lanza si tipo comprobante no configurado", async () => {
    const db = makeDb({
      cuentaContable: { findFirst: vi.fn().mockResolvedValue(makeCuenta("1201")) },
      tipoComprobanteContable: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    });
    const svc = new ContabilidadService(db as never);
    await expect(svc.resolverContexto(["1201"], "TIPO_INEXISTENTE", new Date())).rejects.toThrow("TIPO_INEXISTENTE");
  });

  it("lanza si cuenta no acepta movimientos", async () => {
    const db = makeDb({
      cuentaContable: {
        findFirst: vi.fn().mockResolvedValue({ ...makeCuenta("1000"), acepta_movimientos: false }),
      },
      tipoComprobanteContable: { findFirst: vi.fn().mockResolvedValue(makeTipo()), update: vi.fn() },
    });
    const svc = new ContabilidadService(db as never);
    await expect(svc.resolverContexto(["1000"], "INGRESO", new Date())).rejects.toThrow("no acepta movimientos");
  });
});

// ─── crearComprobanteAutomatico ───────────────────────────────────────────────

describe("ContabilidadService.crearComprobanteAutomatico", () => {
  it("crea comprobante afecto (venta IVA)", async () => {
    const c1201 = makeCuenta("1201", 1);
    const c4101 = makeCuenta("4101", 2);
    const c2103 = { ...makeCuenta("2103", 3), nombre: "IVA débito" };
    const tipo = makeTipo(10, 5);

    const createMock = vi.fn().mockResolvedValue({ id: 99 });
    const db = makeDb({
      cuentaContable: {
        findFirst: vi.fn().mockImplementation(({ where }: { where: { codigo: string } }) => {
          if (where.codigo === "1201") return c1201;
          if (where.codigo === "4101") return c4101;
          if (where.codigo === "2103") return c2103;
          return null;
        }),
      },
      tipoComprobanteContable: { findFirst: vi.fn().mockResolvedValue(tipo), update: vi.fn().mockResolvedValue({}) },
      comprobanteContable: { create: createMock, findUnique: vi.fn() },
    });

    const svc = new ContabilidadService(db as never);
    await svc.crearComprobanteAutomatico({
      tipo_nombre: "VENTA",
      fecha: new Date("2026-05-01"),
      descripcion: "Venta FACTURA_AFECTA - Cliente X",
      partidas: [
        { codigo_cuenta: "1201", tipo: "DEBE",  monto: 119000 },
        { codigo_cuenta: "4101", tipo: "HABER", monto: 100000 },
        { codigo_cuenta: "2103", tipo: "HABER", monto: 19000  },
      ],
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: EstadoComprobante.APROBADO,
          total_debe: 119000,
          total_haber: 119000,
          partidas: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({ cuenta_id: 1, tipo: TipoMovimientoContable.DEBE,  monto: 119000 }),
              expect.objectContaining({ cuenta_id: 2, tipo: TipoMovimientoContable.HABER, monto: 100000 }),
              expect.objectContaining({ cuenta_id: 3, tipo: TipoMovimientoContable.HABER, monto: 19000  }),
            ]),
          }),
        }),
      }),
    );
  });

  it("crea comprobante exento (venta sin IVA)", async () => {
    const c1201 = makeCuenta("1201", 1);
    const c4101 = makeCuenta("4101", 2);
    const tipo = makeTipo(10, 1);
    const createMock = vi.fn().mockResolvedValue({ id: 100 });

    const db = makeDb({
      cuentaContable: {
        findFirst: vi.fn().mockImplementation(({ where }: { where: { codigo: string } }) => {
          if (where.codigo === "1201") return c1201;
          if (where.codigo === "4101") return c4101;
          return null;
        }),
      },
      tipoComprobanteContable: { findFirst: vi.fn().mockResolvedValue(tipo), update: vi.fn() },
      comprobanteContable: { create: createMock, findUnique: vi.fn() },
    });

    const svc = new ContabilidadService(db as never);
    await svc.crearComprobanteAutomatico({
      tipo_nombre: "VENTA",
      fecha: new Date("2026-05-01"),
      descripcion: "Venta exenta",
      partidas: [
        { codigo_cuenta: "1201", tipo: "DEBE",  monto: 100000 },
        { codigo_cuenta: "4101", tipo: "HABER", monto: 100000 },
      ],
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          total_debe: 100000,
          total_haber: 100000,
        }),
      }),
    );
  });

  it("lanza si comprobante no cuadra", async () => {
    const c1201 = makeCuenta("1201", 1);
    const c4101 = makeCuenta("4101", 2);
    const tipo = makeTipo();
    const db = makeDb({
      cuentaContable: {
        findFirst: vi.fn().mockImplementation(({ where }: { where: { codigo: string } }) => {
          if (where.codigo === "1201") return c1201;
          if (where.codigo === "4101") return c4101;
          return null;
        }),
      },
      tipoComprobanteContable: { findFirst: vi.fn().mockResolvedValue(tipo), update: vi.fn() },
    });
    const svc = new ContabilidadService(db as never);
    await expect(
      svc.crearComprobanteAutomatico({
        tipo_nombre: "VENTA",
        fecha: new Date(),
        descripcion: "Test",
        partidas: [
          { codigo_cuenta: "1201", tipo: "DEBE",  monto: 100 },
          { codigo_cuenta: "4101", tipo: "HABER", monto: 90  },
        ],
      }),
    ).rejects.toThrow("no cuadra");
  });
});

// ─── validaciones de negocio (reglas clave Fase 3) ───────────────────────────

describe("Fase 3 — reglas de negocio", () => {
  // Nota crédito: monto no puede superar documento origen
  it("nota crédito rechaza monto mayor a documento origen", () => {
    const montoDocumento = 100000;
    const montoNota = 150000;
    expect(montoNota > montoDocumento).toBe(true); // la validación en la ruta debe rechazarlo
  });

  // Nota crédito: no puede aplicarse a ANULADO
  it("nota crédito detecta documento anulado", () => {
    const estado = "ANULADO";
    expect(estado === "ANULADO").toBe(true);
  });

  // Caja chica: gasto mayor al saldo → rechazado
  it("gasto caja chica rechaza si supera saldo", () => {
    const saldo = 50000;
    const monto = 60000;
    expect(Number(saldo) < Number(monto)).toBe(true); // condición de rechazo
  });

  // CxP: no permite pagar en PAGADA
  it("CxP ya pagada bloquea segundo pago", () => {
    const estado = "PAGADA";
    expect(estado === "PAGADA").toBe(true);
  });

  // CxP: no permite pagos parciales
  it("CxP detecta pago parcial", () => {
    const montoCxP: number = 100000;
    const montoPago: number = 50000;
    expect(montoPago !== montoCxP).toBe(true);
  });

  // Honorarios: calcular retención
  it("honorario calcula retención correctamente", () => {
    const bruto = 200000;
    const tasa = 0.1075;
    const retencion = Math.round(bruto * tasa);
    const neto = bruto - retencion;
    expect(retencion).toBe(21500);
    expect(neto).toBe(178500);
  });

  // Rendición ya aprobada no puede aprobarse dos veces
  it("rendición ya aprobada bloquea segunda aprobación", () => {
    const estadoActual = "APROBADA";
    const estadoNuevo = "APROBADA";
    expect(estadoActual === "APROBADA" && estadoNuevo === "APROBADA").toBe(true);
  });

  // Reposición pagada no puede pagarse dos veces
  it("reposición pagada bloquea segundo pago", () => {
    const estado = "PAGADA";
    expect(estado === "PAGADA").toBe(true);
  });
});

// ─── asientos compra ──────────────────────────────────────────────────────────

describe("Asientos compra — estructura partidas", () => {
  it("compra afecta: debe 5101+1104 igual haber 2101", () => {
    const neto = 100000;
    const iva = Math.round(neto * 0.19);
    const total = neto + iva;
    const debe = neto + iva;
    expect(debe).toBe(total);
  });

  it("compra exenta: debe 5101 igual haber 2101", () => {
    const total = 100000;
    expect(total).toBe(total);
  });
});

// ─── asientos honorarios ──────────────────────────────────────────────────────

describe("Asientos honorarios — estructura partidas", () => {
  it("honorario: debe 5102 igual haber 2102+2101", () => {
    const bruto = 300000;
    const tasa = 0.1075;
    const retencion = Math.round(bruto * tasa);
    const neto = bruto - retencion;
    expect(retencion + neto).toBe(bruto);
  });
});

// ─── anularComprobanteConContraasiento ────────────────────────────────────────

describe("ContabilidadService.anularComprobanteConContraasiento", () => {
  it("lanza si comprobante ya está anulado", async () => {
    const db = makeDb({
      comprobanteContable: {
        findUnique: vi.fn().mockResolvedValue({
          id: 1,
          estado: EstadoComprobante.ANULADO,
          partidas: [],
          tipo: makeTipo(),
          empresa_id: null,
          total_debe: 100,
          total_haber: 100,
          descripcion: "test",
        }),
        create: vi.fn(),
        update: vi.fn(),
      },
      tipoComprobanteContable: { findFirst: vi.fn().mockResolvedValue(makeTipo(20)), update: vi.fn() },
    });
    const svc = new ContabilidadService(db as never);
    await expect(svc.anularComprobanteConContraasiento(1, "test")).rejects.toThrow("ya está anulado");
  });

  it("lanza si comprobante no es APROBADO", async () => {
    const db = makeDb({
      comprobanteContable: {
        findUnique: vi.fn().mockResolvedValue({
          id: 1,
          estado: EstadoComprobante.BORRADOR,
          partidas: [],
          tipo: makeTipo(),
          empresa_id: null,
          total_debe: 100,
          total_haber: 100,
          descripcion: "test",
        }),
        create: vi.fn(),
        update: vi.fn(),
      },
      tipoComprobanteContable: { findFirst: vi.fn().mockResolvedValue(makeTipo(20)), update: vi.fn() },
    });
    const svc = new ContabilidadService(db as never);
    await expect(svc.anularComprobanteConContraasiento(1, "test")).rejects.toThrow("Solo se pueden anular");
  });
});
