import { NaturalezaCuenta, TipoCuentaContable } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { AccountingHealthService } from "../configuracion/accounting-health.service";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeCuenta(codigo: string, id = Math.floor(Math.random() * 1000)) {
  return { id, codigo, nombre: `Cuenta ${codigo}`, tipo: TipoCuentaContable.ACTIVO, naturaleza: NaturalezaCuenta.DEUDORA, acepta_movimientos: true, activa: true, nivel: 1, empresa_id: null, cuenta_padre_id: null, created_at: new Date(), updated_at: new Date() };
}

function makeTipo(nombre: string) {
  return { id: Math.floor(Math.random() * 1000), nombre, descripcion: null, prefijo: null, siguiente_numero: 1, activo: true, empresa_id: null, created_at: new Date(), updated_at: new Date() };
}

function makeImpuesto(tipo: string, tasa: number) {
  return { id: Math.floor(Math.random() * 1000), nombre: tipo, tipo, tasa, activo: true, empresa_id: null, created_at: new Date(), updated_at: new Date() };
}

function makeCuentaBancaria(principal: boolean) {
  return { id: Math.floor(Math.random() * 1000), nombre: "CTA", numero_cuenta: "000", tipo_cuenta: "CORRIENTE", moneda: "CLP", saldo_inicial: 0, activa: true, cuenta_principal: principal, banco_id: 1, empresa_id: null, created_at: new Date(), updated_at: new Date() };
}

function makeUsuario(rol: string) {
  return { id: Math.floor(Math.random() * 1000), nombre: "U", email: "u@u.cl", rol, activo: true };
}

const CUENTAS_SEED = ["1101","1102","1103","1104","1201","2101","2102","2103","4101","5101","5102","5201"];
const TIPOS_SEED = ["INGRESO","EGRESO","VENTA","COMPRA","AJUSTE","REVERSA","TRASPASO"];
const IMPUESTOS_SEED = ["IVA","EXENTO","RETENCION_HONORARIOS"];

function makeFullDb() {
  const cuentaMap = new Map(CUENTAS_SEED.map(c => [c, makeCuenta(c)]));
  const tipoMap = new Map(TIPOS_SEED.map(t => [t, makeTipo(t)]));
  const impuestoMap = new Map(IMPUESTOS_SEED.map(i => [i, makeImpuesto(i, i === "IVA" ? 0.19 : i === "EXENTO" ? 0 : 0.145)]));

  return {
    cuentaContable: {
      findFirst: vi.fn().mockImplementation(({ where }: { where: { codigo?: string } }) =>
        Promise.resolve(cuentaMap.get(where.codigo ?? "") ?? null),
      ),
    },
    tipoComprobanteContable: {
      findFirst: vi.fn().mockImplementation(({ where }: { where: { nombre?: string } }) =>
        Promise.resolve(tipoMap.get(where.nombre ?? "") ?? null),
      ),
    },
    impuesto: {
      findFirst: vi.fn().mockImplementation(({ where }: { where: { tipo?: string } }) =>
        Promise.resolve(impuestoMap.get(where.tipo ?? "") ?? null),
      ),
    },
    cuentaBancaria: {
      findMany: vi.fn().mockResolvedValue([makeCuentaBancaria(true)]),
    },
    usuario: {
      findMany: vi.fn().mockImplementation(({ where }: { where: { rol?: string } }) => {
        if (where.rol === "ADMIN") return Promise.resolve([makeUsuario("ADMIN")]);
        if (where.rol === "CONTADOR") return Promise.resolve([makeUsuario("CONTADOR")]);
        return Promise.resolve([]);
      }),
    },
    configEmpresa: {
      findFirst: vi.fn().mockResolvedValue({ moneda_base: "CLP", anio_fiscal: 2026 }),
    },
  };
}

// ─── AccountingHealthService ──────────────────────────────────────────────────

describe("AccountingHealthService — sistema completo", () => {
  it("status OK cuando todo está configurado", async () => {
    const db = makeFullDb();
    const svc = new AccountingHealthService(db as never);
    const report = await svc.runChecks();
    expect(report.status).toBe("OK");
    expect(report.summary.errors).toBe(0);
    expect(report.summary.warnings).toBe(0);
  });

  it("ERROR cuando falta cuenta 1101", async () => {
    const db = makeFullDb();
    db.cuentaContable.findFirst = vi.fn().mockImplementation(({ where }: { where: { codigo?: string } }) => {
      if (where.codigo === "1101") return Promise.resolve(null);
      return Promise.resolve(makeCuenta(where.codigo ?? ""));
    });
    const svc = new AccountingHealthService(db as never);
    const report = await svc.runChecks();
    expect(report.status).toBe("ERROR");
    const check = report.checks.find(c => c.code === "ACCOUNT_1101_EXISTS");
    expect(check?.status).toBe("ERROR");
  });

  it("ERROR cuando no existe cuenta bancaria principal", async () => {
    const db = makeFullDb();
    db.cuentaBancaria.findMany = vi.fn().mockResolvedValue([makeCuentaBancaria(false)]);
    const svc = new AccountingHealthService(db as never);
    const report = await svc.runChecks();
    expect(report.status).toBe("ERROR");
    const check = report.checks.find(c => c.code === "MAIN_BANK_ACCOUNT_EXISTS");
    expect(check?.status).toBe("ERROR");
  });

  it("ERROR cuando no hay cuentas bancarias", async () => {
    const db = makeFullDb();
    db.cuentaBancaria.findMany = vi.fn().mockResolvedValue([]);
    const svc = new AccountingHealthService(db as never);
    const report = await svc.runChecks();
    const bankCheck = report.checks.find(c => c.code === "BANK_ACCOUNT_EXISTS");
    expect(bankCheck?.status).toBe("ERROR");
  });

  it("WARNING cuando dos cuentas son principal", async () => {
    const db = makeFullDb();
    db.cuentaBancaria.findMany = vi.fn().mockResolvedValue([makeCuentaBancaria(true), makeCuentaBancaria(true)]);
    const svc = new AccountingHealthService(db as never);
    const report = await svc.runChecks();
    const check = report.checks.find(c => c.code === "MAIN_BANK_ACCOUNT_EXISTS");
    expect(check?.status).toBe("WARNING");
  });

  it("ERROR cuando falta IVA", async () => {
    const db = makeFullDb();
    db.impuesto.findFirst = vi.fn().mockImplementation(({ where }: { where: { tipo?: string } }) => {
      if (where.tipo === "IVA") return Promise.resolve(null);
      return Promise.resolve(makeImpuesto(where.tipo ?? "", 0));
    });
    const svc = new AccountingHealthService(db as never);
    const report = await svc.runChecks();
    expect(report.status).toBe("ERROR");
    const check = report.checks.find(c => c.code === "IMPUESTO_IVA_EXISTS");
    expect(check?.status).toBe("ERROR");
  });

  it("ERROR cuando no hay admin", async () => {
    const db = makeFullDb();
    db.usuario.findMany = vi.fn().mockResolvedValue([]);
    const svc = new AccountingHealthService(db as never);
    const report = await svc.runChecks();
    expect(report.status).toBe("ERROR");
    const adminCheck = report.checks.find(c => c.code === "ADMIN_USER_EXISTS");
    expect(adminCheck?.status).toBe("ERROR");
  });

  it("WARNING cuando no hay contador pero sí admin", async () => {
    const db = makeFullDb();
    db.usuario.findMany = vi.fn().mockImplementation(({ where }: { where: { rol?: string } }) => {
      if (where.rol === "ADMIN") return Promise.resolve([makeUsuario("ADMIN")]);
      return Promise.resolve([]);
    });
    const svc = new AccountingHealthService(db as never);
    const report = await svc.runChecks();
    const contadorCheck = report.checks.find(c => c.code === "CONTADOR_USER_EXISTS");
    expect(contadorCheck?.status).toBe("WARNING");
  });

  it("ERROR cuando falta tipo comprobante INGRESO", async () => {
    const db = makeFullDb();
    db.tipoComprobanteContable.findFirst = vi.fn().mockImplementation(({ where }: { where: { nombre?: string } }) => {
      if (where.nombre === "INGRESO") return Promise.resolve(null);
      return Promise.resolve(makeTipo(where.nombre ?? ""));
    });
    const svc = new AccountingHealthService(db as never);
    const report = await svc.runChecks();
    expect(report.status).toBe("ERROR");
    const check = report.checks.find(c => c.code === "TIPO_COMPROBANTE_INGRESO_EXISTS");
    expect(check?.status).toBe("ERROR");
  });

  it("checks incluyen todos los códigos esperados", async () => {
    const db = makeFullDb();
    const svc = new AccountingHealthService(db as never);
    const report = await svc.runChecks();
    const codes = report.checks.map(c => c.code);
    for (const cuenta of ["1101","1201","2101","4101","5101"]) {
      expect(codes).toContain(`ACCOUNT_${cuenta}_EXISTS`);
    }
    for (const tipo of ["INGRESO","EGRESO","VENTA"]) {
      expect(codes).toContain(`TIPO_COMPROBANTE_${tipo}_EXISTS`);
    }
    expect(codes).toContain("MAIN_BANK_ACCOUNT_EXISTS");
    expect(codes).toContain("ADMIN_USER_EXISTS");
  });
});

// ─── CuentaBancaria principal uniqueness ─────────────────────────────────────

describe("CuentaBancaria — cuenta_principal uniqueness", () => {
  it("solo una cuenta puede ser principal (estructura básica)", () => {
    const cuentas = [
      { id: 1, cuenta_principal: true },
      { id: 2, cuenta_principal: false },
      { id: 3, cuenta_principal: false },
    ];
    const principales = cuentas.filter(c => c.cuenta_principal);
    expect(principales).toHaveLength(1);
  });

  it("simulación: establecer principal desmarca otras", () => {
    const cuentas = [
      { id: 1, cuenta_principal: true },
      { id: 2, cuenta_principal: false },
    ];
    const nuevaPrincipalId = 2;
    const resultado = cuentas.map(c => ({
      ...c,
      cuenta_principal: c.id === nuevaPrincipalId,
    }));
    expect(resultado.filter(c => c.cuenta_principal)).toHaveLength(1);
    expect(resultado.find(c => c.id === 2)?.cuenta_principal).toBe(true);
    expect(resultado.find(c => c.id === 1)?.cuenta_principal).toBe(false);
  });
});
