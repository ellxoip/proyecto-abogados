import { PrismaClient } from "@prisma/client";

type CheckStatus = "OK" | "WARNING" | "ERROR";

interface HealthCheck {
  code: string;
  status: CheckStatus;
  message: string;
}

interface HealthReport {
  status: CheckStatus;
  checks: HealthCheck[];
  summary: { ok: number; warnings: number; errors: number };
}

type PrismaLike = Pick<
  PrismaClient,
  "cuentaContable" | "tipoComprobanteContable" | "impuesto" | "cuentaBancaria" | "usuario" | "configEmpresa"
>;

const CUENTAS_REQUERIDAS = [
  { codigo: "1101", nombre: "Banco" },
  { codigo: "1102", nombre: "Caja" },
  { codigo: "1103", nombre: "Caja chica" },
  { codigo: "1104", nombre: "IVA crédito fiscal" },
  { codigo: "1201", nombre: "CxC clientes" },
  { codigo: "2101", nombre: "CxP proveedores" },
  { codigo: "2102", nombre: "Retenciones por pagar" },
  { codigo: "2103", nombre: "IVA débito fiscal" },
  { codigo: "4101", nombre: "Ingresos" },
  { codigo: "5101", nombre: "Gastos" },
  { codigo: "5102", nombre: "Honorarios" },
  { codigo: "5201", nombre: "Descuentos/condonaciones" },
];

const TIPOS_COMPROBANTE_REQUERIDOS = ["INGRESO", "EGRESO", "VENTA", "COMPRA", "AJUSTE", "REVERSA", "TRASPASO"];
const IMPUESTOS_REQUERIDOS = ["IVA", "EXENTO", "RETENCION_HONORARIOS"];

export class AccountingHealthService {
  constructor(private readonly db: PrismaLike) {}

  async runChecks(empresa_id?: number | null): Promise<HealthReport> {
    const checks: HealthCheck[] = [];

    await this.checkPlanCuentas(checks, empresa_id);
    await this.checkTiposComprobante(checks, empresa_id);
    await this.checkImpuestos(checks, empresa_id);
    await this.checkCuentasBancarias(checks);
    await this.checkUsuarios(checks, empresa_id);
    await this.checkConfigEmpresa(checks, empresa_id);

    const ok = checks.filter(c => c.status === "OK").length;
    const warnings = checks.filter(c => c.status === "WARNING").length;
    const errors = checks.filter(c => c.status === "ERROR").length;
    const status: CheckStatus = errors > 0 ? "ERROR" : warnings > 0 ? "WARNING" : "OK";

    return { status, checks, summary: { ok, warnings, errors } };
  }

  private async checkPlanCuentas(checks: HealthCheck[], empresa_id?: number | null) {
    for (const { codigo, nombre } of CUENTAS_REQUERIDAS) {
      const cuenta = await this.db.cuentaContable.findFirst({
        where: empresa_id != null ? { codigo, empresa_id } : { codigo },
      });
      checks.push({
        code: `ACCOUNT_${codigo}_EXISTS`,
        status: cuenta ? "OK" : "ERROR",
        message: cuenta
          ? `Cuenta ${codigo} ${nombre} existe`
          : `Falta cuenta ${codigo} ${nombre} — ejecutar seed`,
      });
    }
  }

  private async checkTiposComprobante(checks: HealthCheck[], empresa_id?: number | null) {
    for (const nombre of TIPOS_COMPROBANTE_REQUERIDOS) {
      const tipo = await this.db.tipoComprobanteContable.findFirst({
        where: empresa_id != null ? { nombre, empresa_id } : { nombre },
      });
      checks.push({
        code: `TIPO_COMPROBANTE_${nombre}_EXISTS`,
        status: tipo ? "OK" : "ERROR",
        message: tipo
          ? `Tipo comprobante ${nombre} existe (siguiente #${tipo.siguiente_numero})`
          : `Falta tipo comprobante ${nombre} — ejecutar seed`,
      });
    }
  }

  private async checkImpuestos(checks: HealthCheck[], empresa_id?: number | null) {
    for (const tipo of IMPUESTOS_REQUERIDOS) {
      const imp = await this.db.impuesto.findFirst({
        where: empresa_id != null ? { tipo, activo: true, empresa_id } : { tipo, activo: true },
      });
      if (!imp) {
        checks.push({ code: `IMPUESTO_${tipo}_EXISTS`, status: "ERROR", message: `Falta impuesto activo tipo ${tipo}` });
        continue;
      }
      const tasa = Number(imp.tasa);
      const tasaOk = tasa >= 0 && tasa <= 1;
      checks.push({
        code: `IMPUESTO_${tipo}_EXISTS`,
        status: tasaOk ? "OK" : "WARNING",
        message: tasaOk
          ? `Impuesto ${tipo} activo (tasa ${(tasa * 100).toFixed(2)}%)`
          : `Impuesto ${tipo} tiene tasa sospechosa: ${tasa}`,
      });
    }
  }

  private async checkCuentasBancarias(checks: HealthCheck[]) {
    const cuentas = await this.db.cuentaBancaria.findMany({ where: { activa: true } });
    checks.push({
      code: "BANK_ACCOUNT_EXISTS",
      status: cuentas.length > 0 ? "OK" : "ERROR",
      message: cuentas.length > 0
        ? `${cuentas.length} cuenta(s) bancaria(s) activa(s)`
        : "No existe ninguna cuenta bancaria activa",
    });

    const principales = cuentas.filter(c => c.cuenta_principal);
    checks.push({
      code: "MAIN_BANK_ACCOUNT_EXISTS",
      status: principales.length === 1 ? "OK" : principales.length === 0 ? "ERROR" : "WARNING",
      message:
        principales.length === 1
          ? `Cuenta principal: ${principales[0].nombre}`
          : principales.length === 0
          ? "No existe cuenta bancaria principal — pagos PagaCuotas no se contabilizan"
          : `Hay ${principales.length} cuentas marcadas como principal — debe haber exactamente una`,
    });
  }

  private async checkUsuarios(checks: HealthCheck[], empresa_id?: number | null) {
    const [admins, contadores] = await Promise.all([
      this.db.usuario.findMany({
        where: empresa_id != null
          ? { rol: "ADMIN", activo: true, empresa_id }
          : { rol: "ADMIN", activo: true },
      }),
      this.db.usuario.findMany({
        where: empresa_id != null
          ? { rol: "CONTADOR", activo: true, empresa_id }
          : { rol: "CONTADOR", activo: true },
      }),
    ]);

    checks.push({
      code: "ADMIN_USER_EXISTS",
      status: admins.length > 0 ? "OK" : "ERROR",
      message: admins.length > 0
        ? `${admins.length} administrador(es) activo(s)`
        : "No existe ningún administrador activo",
    });

    checks.push({
      code: "CONTADOR_USER_EXISTS",
      status: contadores.length > 0 ? "OK" : "WARNING",
      message: contadores.length > 0
        ? `${contadores.length} contador(es) activo(s)`
        : "No existe ningún contador activo — solo ADMIN puede registrar comprobantes",
    });
  }

  private async checkConfigEmpresa(checks: HealthCheck[], empresa_id?: number | null) {
    const config = await this.db.configEmpresa.findFirst({
      where: empresa_id != null ? { empresa_id } : {},
    });

    checks.push({
      code: "CONFIG_EMPRESA_EXISTS",
      status: config ? "OK" : "WARNING",
      message: config
        ? `Config empresa: moneda ${config.moneda_base}${config.anio_fiscal ? `, año fiscal ${config.anio_fiscal}` : ""}`
        : "Sin configuración de empresa — se usarán valores por defecto",
    });
  }
}
