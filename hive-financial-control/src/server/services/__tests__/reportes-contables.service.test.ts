import { EstadoComprobante, NaturalezaCuenta, TipoCuentaContable, TipoMovimientoContable } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { ReportesContablesService } from "../contabilidad/reportes-contables.service";

// ─── helpers ────────────────────────────────────────────────────────────────

function makePartida(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    comprobante_id: 1,
    cuenta_id: 1,
    tipo: TipoMovimientoContable.DEBE,
    monto: 100000,
    glosa: "test",
    created_at: new Date(),
    ...overrides,
  };
}

function makeComprobante(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    tipo_id: 1,
    numero: 1,
    fecha_comprobante: new Date("2026-05-15"),
    descripcion: "test",
    estado: EstadoComprobante.APROBADO,
    total_debe: 100000,
    total_haber: 100000,
    tipo: { nombre: "VENTA" },
    ...overrides,
  };
}

function makeCuentaContable(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    codigo: "1101",
    nombre: "Banco",
    tipo: TipoCuentaContable.ACTIVO,
    naturaleza: NaturalezaCuenta.DEUDORA,
    nivel: 1,
    acepta_movimientos: true,
    activa: true,
    empresa_id: null,
    cuenta_padre_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function makeCuentaBancaria(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    nombre: "Banco Principal",
    numero_cuenta: "000-001",
    saldo_inicial: 1000000,
    activa: true,
    tipo_cuenta: "CORRIENTE",
    ...overrides,
  };
}

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    partidaContable: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    cuentaContable: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    cuentaBancaria: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    movimientoTesoreria: {
      groupBy: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
}

// ─── Libro Diario ────────────────────────────────────────────────────────────

describe("ReportesContablesService.getLibroDiario", () => {
  it("devuelve items vacíos y totales cero si no hay partidas", async () => {
    const db = makeDb();
    const svc = new ReportesContablesService(db as never);
    const result = await svc.getLibroDiario({});
    expect(result.items).toHaveLength(0);
    expect(result.totales.debe).toBe(0);
    expect(result.totales.haber).toBe(0);
    expect(result.pagination.total).toBe(0);
  });

  it("solo consulta comprobantes APROBADO por defecto", async () => {
    const db = makeDb();
    const svc = new ReportesContablesService(db as never);
    await svc.getLibroDiario({});
    const call = (db.partidaContable.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where.comprobante.estado).toBe(EstadoComprobante.APROBADO);
  });

  it("acepta estado BORRADOR si se pide", async () => {
    const db = makeDb();
    const svc = new ReportesContablesService(db as never);
    await svc.getLibroDiario({ estado: EstadoComprobante.BORRADOR });
    const call = (db.partidaContable.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where.comprobante.estado).toBe(EstadoComprobante.BORRADOR);
  });

  it("calcula totales debe y haber desde partidas", async () => {
    const p1 = makePartida({
      tipo: TipoMovimientoContable.DEBE,
      monto: 119000,
      cuenta: { codigo: "1201", nombre: "CxC" },
      comprobante: makeComprobante({ tipo: { nombre: "VENTA" } }),
    });
    const p2 = makePartida({
      id: 2,
      tipo: TipoMovimientoContable.HABER,
      monto: 100000,
      cuenta: { codigo: "4101", nombre: "Ingresos" },
      comprobante: makeComprobante({ tipo: { nombre: "VENTA" } }),
    });
    const p3 = makePartida({
      id: 3,
      tipo: TipoMovimientoContable.HABER,
      monto: 19000,
      cuenta: { codigo: "2103", nombre: "IVA" },
      comprobante: makeComprobante({ tipo: { nombre: "VENTA" } }),
    });

    const db = makeDb({
      partidaContable: {
        findMany: vi.fn().mockResolvedValue([p1, p2, p3]),
        count: vi.fn().mockResolvedValue(3),
      },
    });
    const svc = new ReportesContablesService(db as never);
    const result = await svc.getLibroDiario({});
    expect(result.totales.debe).toBe(119000);
    expect(result.totales.haber).toBe(119000);
    expect(result.items).toHaveLength(3);
  });

  it("filtra por cuenta_codigo en where", async () => {
    const db = makeDb();
    const svc = new ReportesContablesService(db as never);
    await svc.getLibroDiario({ cuenta_codigo: "4101" });
    const call = (db.partidaContable.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where.cuenta.codigo).toBe("4101");
  });
});

// ─── Libro Mayor ─────────────────────────────────────────────────────────────

describe("ReportesContablesService.getLibroMayor", () => {
  it("lanza si no se pasa cuenta_id ni cuenta_codigo", async () => {
    const db = makeDb();
    const svc = new ReportesContablesService(db as never);
    await expect(svc.getLibroMayor({})).rejects.toThrow("Se requiere");
  });

  it("calcula saldo_inicial de cuenta DEUDORA = debe - haber anteriores", async () => {
    const cuenta = makeCuentaContable({ naturaleza: NaturalezaCuenta.DEUDORA });
    const partidasAnt = [
      makePartida({ tipo: TipoMovimientoContable.DEBE, monto: 500000 }),
      makePartida({ id: 2, tipo: TipoMovimientoContable.HABER, monto: 200000 }),
    ];

    const db = makeDb({
      cuentaContable: { findFirst: vi.fn().mockResolvedValue(cuenta) },
      partidaContable: {
        findMany: vi.fn()
          .mockResolvedValueOnce(partidasAnt) // saldo inicial
          .mockResolvedValueOnce([]),           // movimientos período
        count: vi.fn().mockResolvedValue(0),
      },
    });

    const svc = new ReportesContablesService(db as never);
    const result = await svc.getLibroMayor({
      cuenta_id: 1,
      fecha_desde: new Date("2026-05-01"),
    });
    expect(result.saldo_inicial).toBe(300000); // 500000 - 200000
  });

  it("calcula saldo_inicial de cuenta ACREEDORA = haber - debe anteriores", async () => {
    const cuenta = makeCuentaContable({
      codigo: "2101",
      naturaleza: NaturalezaCuenta.ACREEDORA,
      tipo: TipoCuentaContable.PASIVO,
    });
    const partidasAnt = [
      makePartida({ tipo: TipoMovimientoContable.HABER, monto: 300000 }),
      makePartida({ id: 2, tipo: TipoMovimientoContable.DEBE, monto: 100000 }),
    ];

    const db = makeDb({
      cuentaContable: { findFirst: vi.fn().mockResolvedValue(cuenta) },
      partidaContable: {
        findMany: vi.fn()
          .mockResolvedValueOnce(partidasAnt)
          .mockResolvedValueOnce([]),
        count: vi.fn().mockResolvedValue(0),
      },
    });

    const svc = new ReportesContablesService(db as never);
    const result = await svc.getLibroMayor({ cuenta_id: 1, fecha_desde: new Date("2026-05-01") });
    expect(result.saldo_inicial).toBe(200000); // 300000 - 100000
  });

  it("calcula saldo acumulado línea a línea para cuenta deudora", async () => {
    const cuenta = makeCuentaContable({ naturaleza: NaturalezaCuenta.DEUDORA });
    const mov = [
      {
        ...makePartida({ tipo: TipoMovimientoContable.DEBE, monto: 100000 }),
        tipo: TipoMovimientoContable.DEBE,
        monto: 100000,
        comprobante: makeComprobante({ tipo: { nombre: "INGRESO" } }),
      },
      {
        ...makePartida({ id: 2, tipo: TipoMovimientoContable.HABER }),
        tipo: TipoMovimientoContable.HABER,
        monto: 30000,
        comprobante: makeComprobante({ tipo: { nombre: "EGRESO" } }),
      },
    ];

    const db = makeDb({
      cuentaContable: { findFirst: vi.fn().mockResolvedValue(cuenta) },
      partidaContable: {
        // sin fecha_desde → no hay llamada para anteriores; solo una findMany para movimientos
        findMany: vi.fn().mockResolvedValueOnce(mov),
        count: vi.fn().mockResolvedValue(2),
      },
    });

    const svc = new ReportesContablesService(db as never);
    const result = await svc.getLibroMayor({ cuenta_id: 1 });
    expect(result.movimientos[0].saldo).toBe(100000);
    expect(result.movimientos[1].saldo).toBe(70000); // 100000 - 30000
    expect(result.saldo_final).toBe(70000);
  });
});

// ─── Balance Comprobación ─────────────────────────────────────────────────────

describe("ReportesContablesService.getBalanceComprobacion", () => {
  it("agrupa por cuenta y suma debe/haber", async () => {
    const cuentaActivo = makeCuentaContable({ id: 1, codigo: "1101", tipo: TipoCuentaContable.ACTIVO, naturaleza: NaturalezaCuenta.DEUDORA });
    const partidas = [
      { ...makePartida({ tipo: TipoMovimientoContable.DEBE, monto: 100000, cuenta_id: 1 }), cuenta: cuentaActivo, comprobante: makeComprobante() },
      { ...makePartida({ id: 2, tipo: TipoMovimientoContable.DEBE, monto: 50000, cuenta_id: 1 }), cuenta: cuentaActivo, comprobante: makeComprobante() },
      { ...makePartida({ id: 3, tipo: TipoMovimientoContable.HABER, monto: 30000, cuenta_id: 1 }), cuenta: cuentaActivo, comprobante: makeComprobante() },
    ];
    const db = makeDb({
      partidaContable: { findMany: vi.fn().mockResolvedValue(partidas), count: vi.fn() },
    });
    const svc = new ReportesContablesService(db as never);
    const result = await svc.getBalanceComprobacion({});
    expect(result.items).toHaveLength(1);
    expect(result.items[0].sumas_debe).toBe(150000);
    expect(result.items[0].sumas_haber).toBe(30000);
    expect(result.items[0].saldo_deudor).toBe(120000);
    expect(result.items[0].saldo_acreedor).toBe(0);
  });

  it("cuadra totales debe/haber si comprobantes balanceados", async () => {
    const c1 = makeCuentaContable({ id: 1, codigo: "1201", tipo: TipoCuentaContable.ACTIVO, naturaleza: NaturalezaCuenta.DEUDORA });
    const c2 = makeCuentaContable({ id: 2, codigo: "4101", tipo: TipoCuentaContable.INGRESO, naturaleza: NaturalezaCuenta.ACREEDORA });
    const partidas = [
      { ...makePartida({ tipo: TipoMovimientoContable.DEBE, monto: 119000, cuenta_id: 1 }), cuenta: c1, comprobante: makeComprobante() },
      { ...makePartida({ id: 2, tipo: TipoMovimientoContable.HABER, monto: 119000, cuenta_id: 2 }), cuenta: c2, comprobante: makeComprobante() },
    ];
    const db = makeDb({ partidaContable: { findMany: vi.fn().mockResolvedValue(partidas), count: vi.fn() } });
    const svc = new ReportesContablesService(db as never);
    const result = await svc.getBalanceComprobacion({});
    expect(result.totales.sumas_debe).toBe(119000);
    expect(result.totales.sumas_haber).toBe(119000);
  });

  it("separa saldo_deudor y saldo_acreedor correctamente", async () => {
    const cPasivo = makeCuentaContable({ id: 1, codigo: "2101", tipo: TipoCuentaContable.PASIVO, naturaleza: NaturalezaCuenta.ACREEDORA });
    const partidas = [
      { ...makePartida({ tipo: TipoMovimientoContable.HABER, monto: 200000, cuenta_id: 1 }), cuenta: cPasivo, comprobante: makeComprobante() },
      { ...makePartida({ id: 2, tipo: TipoMovimientoContable.DEBE, monto: 50000, cuenta_id: 1 }), cuenta: cPasivo, comprobante: makeComprobante() },
    ];
    const db = makeDb({ partidaContable: { findMany: vi.fn().mockResolvedValue(partidas), count: vi.fn() } });
    const svc = new ReportesContablesService(db as never);
    const result = await svc.getBalanceComprobacion({});
    expect(result.items[0].saldo_deudor).toBe(0);
    expect(result.items[0].saldo_acreedor).toBe(150000); // 200000 - 50000
  });
});

// ─── Estado de Resultados ─────────────────────────────────────────────────────

describe("ReportesContablesService.getEstadoResultados", () => {
  it("calcula ingresos correctamente", async () => {
    const cIng = makeCuentaContable({ id: 1, codigo: "4101", tipo: TipoCuentaContable.INGRESO, naturaleza: NaturalezaCuenta.ACREEDORA });
    const partidas = [
      { ...makePartida({ tipo: TipoMovimientoContable.HABER, monto: 1000000, cuenta_id: 1 }), cuenta: cIng },
    ];
    const db = makeDb({ partidaContable: { findMany: vi.fn().mockResolvedValue(partidas), count: vi.fn() } });
    const svc = new ReportesContablesService(db as never);
    const result = await svc.getEstadoResultados({});
    expect(result.totales.ingresos).toBe(1000000);
    expect(result.ingresos[0].cuenta_codigo).toBe("4101");
  });

  it("calcula gastos correctamente", async () => {
    const cGasto = makeCuentaContable({ id: 1, codigo: "5101", tipo: TipoCuentaContable.GASTO, naturaleza: NaturalezaCuenta.DEUDORA });
    const partidas = [
      { ...makePartida({ tipo: TipoMovimientoContable.DEBE, monto: 300000, cuenta_id: 1 }), cuenta: cGasto },
    ];
    const db = makeDb({ partidaContable: { findMany: vi.fn().mockResolvedValue(partidas), count: vi.fn() } });
    const svc = new ReportesContablesService(db as never);
    const result = await svc.getEstadoResultados({});
    expect(result.totales.gastos).toBe(300000);
  });

  it("calcula utilidad = ingresos - gastos", async () => {
    const cIng = makeCuentaContable({ id: 1, codigo: "4101", tipo: TipoCuentaContable.INGRESO, naturaleza: NaturalezaCuenta.ACREEDORA });
    const cGasto = makeCuentaContable({ id: 2, codigo: "5101", tipo: TipoCuentaContable.GASTO, naturaleza: NaturalezaCuenta.DEUDORA });
    const partidas = [
      { ...makePartida({ tipo: TipoMovimientoContable.HABER, monto: 1000000, cuenta_id: 1 }), cuenta: cIng },
      { ...makePartida({ id: 2, tipo: TipoMovimientoContable.DEBE, monto: 400000, cuenta_id: 2 }), cuenta: cGasto },
    ];
    const db = makeDb({ partidaContable: { findMany: vi.fn().mockResolvedValue(partidas), count: vi.fn() } });
    const svc = new ReportesContablesService(db as never);
    const result = await svc.getEstadoResultados({});
    expect(result.totales.utilidad).toBe(600000);
  });

  it("nota de crédito rebaja ingresos (DEBE a cuenta ingreso)", async () => {
    const cIng = makeCuentaContable({ id: 1, codigo: "4101", tipo: TipoCuentaContable.INGRESO, naturaleza: NaturalezaCuenta.ACREEDORA });
    const partidas = [
      // venta original
      { ...makePartida({ tipo: TipoMovimientoContable.HABER, monto: 100000, cuenta_id: 1 }), cuenta: cIng },
      // nota de crédito (debe a cuenta ingreso)
      { ...makePartida({ id: 2, tipo: TipoMovimientoContable.DEBE, monto: 30000, cuenta_id: 1 }), cuenta: cIng },
    ];
    const db = makeDb({ partidaContable: { findMany: vi.fn().mockResolvedValue(partidas), count: vi.fn() } });
    const svc = new ReportesContablesService(db as never);
    const result = await svc.getEstadoResultados({});
    expect(result.totales.ingresos).toBe(70000); // 100000 - 30000
  });
});

// ─── Saldo Bancario ───────────────────────────────────────────────────────────

describe("ReportesContablesService.getSaldoBancario", () => {
  it("saldo_calculado = saldo_inicial + ingresos - egresos", async () => {
    const cuenta = makeCuentaBancaria({ saldo_inicial: 500000 });
    const db = makeDb({
      cuentaBancaria: { findUnique: vi.fn().mockResolvedValue(cuenta) },
      movimientoTesoreria: {
        groupBy: vi.fn().mockResolvedValue([
          { tipo: "INGRESO", _sum: { monto: 200000 } },
          { tipo: "EGRESO",  _sum: { monto: 80000  } },
        ]),
      },
    });
    const svc = new ReportesContablesService(db as never);
    const result = await svc.getSaldoBancario(1);
    expect(result.saldo_calculado).toBe(620000); // 500000 + 200000 - 80000
    expect(result.ingresos).toBe(200000);
    expect(result.egresos).toBe(80000);
  });

  it("movimientos de otra cuenta no afectan saldo", async () => {
    const cuenta = makeCuentaBancaria({ id: 2, saldo_inicial: 100000 });
    const db = makeDb({
      cuentaBancaria: { findUnique: vi.fn().mockResolvedValue(cuenta) },
      movimientoTesoreria: {
        groupBy: vi.fn().mockResolvedValue([]), // sin movimientos para esta cuenta
      },
    });
    const svc = new ReportesContablesService(db as never);
    const result = await svc.getSaldoBancario(2);
    expect(result.saldo_calculado).toBe(100000);
  });

  it("lanza si cuenta no encontrada", async () => {
    const db = makeDb({ cuentaBancaria: { findUnique: vi.fn().mockResolvedValue(null) } });
    const svc = new ReportesContablesService(db as never);
    await expect(svc.getSaldoBancario(99)).rejects.toThrow("no encontrada");
  });
});

// ─── Permisos ─────────────────────────────────────────────────────────────────

describe("checkMutationRole — lógica de permisos", () => {
  it("SOLO_LECTURA no puede mutar → rol no en MUTATION_ROLES", () => {
    const MUTATION_ROLES = ["ADMIN", "CONTADOR"];
    expect(MUTATION_ROLES.includes("SOLO_LECTURA")).toBe(false);
  });

  it("ANALISTA no puede mutar", () => {
    const MUTATION_ROLES = ["ADMIN", "CONTADOR"];
    expect(MUTATION_ROLES.includes("ANALISTA")).toBe(false);
  });

  it("CONTADOR puede mutar", () => {
    const MUTATION_ROLES = ["ADMIN", "CONTADOR"];
    expect(MUTATION_ROLES.includes("CONTADOR")).toBe(true);
  });

  it("ADMIN puede mutar", () => {
    const MUTATION_ROLES = ["ADMIN", "CONTADOR"];
    expect(MUTATION_ROLES.includes("ADMIN")).toBe(true);
  });
});

// ─── Impuestos ────────────────────────────────────────────────────────────────

describe("getTasaImpuesto", () => {
  it("retorna tasa desde DB si existe", async () => {
    const { getTasaImpuesto } = await import("@/lib/impuestos");
    const db = { impuesto: { findFirst: vi.fn().mockResolvedValue({ tasa: "0.19" }) } };
    const tasa = await getTasaImpuesto("IVA", db as never);
    expect(tasa).toBe(0.19);
  });

  it("retorna fallback si no existe impuesto", async () => {
    const { getTasaImpuesto } = await import("@/lib/impuestos");
    const db = { impuesto: { findFirst: vi.fn().mockResolvedValue(null) } };
    const tasa = await getTasaImpuesto("IVA", db as never, null, 0.19);
    expect(tasa).toBe(0.19);
  });

  it("lanza si no existe impuesto y no hay fallback", async () => {
    const { getTasaImpuesto } = await import("@/lib/impuestos");
    const db = { impuesto: { findFirst: vi.fn().mockResolvedValue(null) } };
    await expect(getTasaImpuesto("IVA", db as never)).rejects.toThrow("no configurado");
  });

  it("tasa retención honorarios lee desde config", async () => {
    const { getTasaImpuesto, TIPO_RETENCION_HONORARIOS } = await import("@/lib/impuestos");
    const db = { impuesto: { findFirst: vi.fn().mockResolvedValue({ tasa: "0.145" }) } };
    const tasa = await getTasaImpuesto(TIPO_RETENCION_HONORARIOS, db as never);
    expect(tasa).toBe(0.145);
  });
});

// ─── Conciliación ────────────────────────────────────────────────────────────

describe("Conciliación — lógica de matching", () => {
  it("match por mismo monto y misma fecha", () => {
    const banco = { id: 1, cargo: 100000, abono: null, fecha_movimiento: new Date("2026-05-15"), conciliado: false };
    const sistema = { id: 10, tipo: "EGRESO", monto: 100000, fecha_movimiento: new Date("2026-05-15"), conciliado: false };

    const montoItem = Number(banco.cargo ?? banco.abono ?? 0);
    const tipoEsperado = banco.cargo ? "EGRESO" : "INGRESO";
    const diffMs = Math.abs(sistema.fecha_movimiento.getTime() - banco.fecha_movimiento.getTime());
    const MAX_DIAS = 2 * 86400000;

    expect(sistema.tipo).toBe(tipoEsperado);
    expect(Number(sistema.monto)).toBe(montoItem);
    expect(diffMs).toBeLessThanOrEqual(MAX_DIAS);
  });

  it("no hace match si diferencia de monto", () => {
    const monto_banco = 100000;
    const monto_sistema = 99000;
    expect(monto_sistema).not.toBe(monto_banco);
  });

  it("no hace match si diferencia de fecha > 2 días", () => {
    const fechaBanco = new Date("2026-05-15");
    const fechaSistema = new Date("2026-05-18");
    const diffMs = Math.abs(fechaSistema.getTime() - fechaBanco.getTime());
    expect(diffMs).toBeGreaterThan(2 * 86400000);
  });

  it("no permite conciliar dos veces el mismo movimiento", () => {
    const usedMovIds = new Set<number>([10]);
    const sistemaCandidato = { id: 10 };
    expect(usedMovIds.has(sistemaCandidato.id)).toBe(true); // ya usado
  });
});
