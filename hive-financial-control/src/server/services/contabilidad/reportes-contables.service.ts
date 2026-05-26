import {
  EstadoComprobante,
  NaturalezaCuenta,
  PrismaClient,
  TipoCuentaContable,
  TipoMovimientoContable,
} from "@prisma/client";

type PrismaLike = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export interface ReportParams {
  empresa_id?: number | null;
  fecha_desde?: Date;
  fecha_hasta?: Date;
  estado?: EstadoComprobante;
}

export interface LibroDiarioParams extends ReportParams {
  cuenta_id?: number;
  cuenta_codigo?: string;
  tipo_comprobante_id?: number;
  page?: number;
  page_size?: number;
}

export interface LibroMayorParams extends ReportParams {
  cuenta_id?: number;
  cuenta_codigo?: string;
  page?: number;
  page_size?: number;
}

export interface BalanceParams extends ReportParams {
  nivel?: number;
  incluir_cuentas_sin_movimiento?: boolean;
}

export interface EstadoResultadosParams extends ReportParams {
  comparar_con_periodo_anterior?: boolean;
}

const CUENTAS_RESULTADO: TipoCuentaContable[] = [
  TipoCuentaContable.INGRESO,
  TipoCuentaContable.GASTO,
  TipoCuentaContable.COSTO,
];

const CUENTAS_INVENTARIO: TipoCuentaContable[] = [
  TipoCuentaContable.ACTIVO,
  TipoCuentaContable.PASIVO,
  TipoCuentaContable.PATRIMONIO,
];

function buildFechaFilter(params: ReportParams) {
  if (!params.fecha_desde && !params.fecha_hasta) return undefined;
  return {
    ...(params.fecha_desde ? { gte: params.fecha_desde } : {}),
    ...(params.fecha_hasta ? { lte: params.fecha_hasta } : {}),
  };
}

export class ReportesContablesService {
  constructor(private readonly db: PrismaLike) {}

  async getLibroDiario(params: LibroDiarioParams) {
    const {
      estado = EstadoComprobante.APROBADO,
      page = 1,
      page_size = 50,
      cuenta_id,
      cuenta_codigo,
      tipo_comprobante_id,
    } = params;

    const fechaFilter = buildFechaFilter(params);
    const comprobanteWhere = {
      estado,
      ...(fechaFilter ? { fecha_comprobante: fechaFilter } : {}),
      ...(tipo_comprobante_id ? { tipo_id: tipo_comprobante_id } : {}),
    };

    const cuentaWhere = cuenta_codigo
      ? { codigo: cuenta_codigo }
      : cuenta_id
        ? { id: cuenta_id }
        : undefined;

    const [partidas, total] = await Promise.all([
      this.db.partidaContable.findMany({
        where: {
          comprobante: comprobanteWhere,
          ...(cuentaWhere ? { cuenta: cuentaWhere } : {}),
          ...(cuenta_id && !cuenta_codigo ? { cuenta_id } : {}),
        },
        include: {
          comprobante: {
            include: { tipo: { select: { nombre: true } } },
          },
          cuenta: { select: { codigo: true, nombre: true } },
        },
        orderBy: [
          { comprobante: { fecha_comprobante: "asc" } },
          { comprobante: { tipo_id: "asc" } },
          { comprobante: { numero: "asc" } },
          { id: "asc" },
        ],
        skip: (page - 1) * page_size,
        take: page_size,
      }),
      this.db.partidaContable.count({
        where: {
          comprobante: comprobanteWhere,
          ...(cuentaWhere ? { cuenta: cuentaWhere } : {}),
          ...(cuenta_id && !cuenta_codigo ? { cuenta_id } : {}),
        },
      }),
    ]);

    const items = partidas.map((p) => ({
      fecha: p.comprobante.fecha_comprobante,
      comprobante_id: p.comprobante.id,
      tipo: p.comprobante.tipo.nombre,
      numero: p.comprobante.numero,
      estado: p.comprobante.estado,
      glosa: p.glosa ?? p.comprobante.descripcion,
      cuenta_codigo: p.cuenta.codigo,
      cuenta_nombre: p.cuenta.nombre,
      debe: p.tipo === TipoMovimientoContable.DEBE ? Number(p.monto) : 0,
      haber: p.tipo === TipoMovimientoContable.HABER ? Number(p.monto) : 0,
    }));

    const totales = items.reduce(
      (acc, i) => ({ debe: acc.debe + i.debe, haber: acc.haber + i.haber }),
      { debe: 0, haber: 0 },
    );

    return {
      items,
      totales,
      pagination: { page, page_size, total },
    };
  }

  async getLibroMayor(params: LibroMayorParams) {
    const {
      cuenta_id,
      cuenta_codigo,
      estado = EstadoComprobante.APROBADO,
      fecha_desde,
      fecha_hasta,
      page = 1,
      page_size = 100,
    } = params;

    if (!cuenta_id && !cuenta_codigo) {
      throw new Error("Se requiere cuenta_id o cuenta_codigo");
    }

    const cuenta = await this.db.cuentaContable.findFirst({
      where: cuenta_codigo
        ? { codigo: cuenta_codigo }
        : { id: cuenta_id! },
    });
    if (!cuenta) throw new Error("Cuenta contable no encontrada");

    const cuentaIdReal = cuenta.id;
    const esDeudora = cuenta.naturaleza === NaturalezaCuenta.DEUDORA;

    // saldo inicial: partidas aprobadas ANTES de fecha_desde
    const partidasAnt = fecha_desde
      ? await this.db.partidaContable.findMany({
          where: {
            cuenta_id: cuentaIdReal,
            comprobante: {
              estado,
              fecha_comprobante: { lt: fecha_desde },
            },
          },
          select: { tipo: true, monto: true },
        })
      : [];

    const debe0 = partidasAnt
      .filter((p) => p.tipo === TipoMovimientoContable.DEBE)
      .reduce((s, p) => s + Number(p.monto), 0);
    const haber0 = partidasAnt
      .filter((p) => p.tipo === TipoMovimientoContable.HABER)
      .reduce((s, p) => s + Number(p.monto), 0);

    const saldo_inicial = esDeudora ? debe0 - haber0 : haber0 - debe0;

    const fechaFilter = buildFechaFilter({ fecha_desde, fecha_hasta });
    const [movimientos, totalMovs] = await Promise.all([
      this.db.partidaContable.findMany({
        where: {
          cuenta_id: cuentaIdReal,
          comprobante: {
            estado,
            ...(fechaFilter ? { fecha_comprobante: fechaFilter } : {}),
          },
        },
        include: {
          comprobante: {
            include: { tipo: { select: { nombre: true } } },
          },
        },
        orderBy: [
          { comprobante: { fecha_comprobante: "asc" } },
          { comprobante: { numero: "asc" } },
          { id: "asc" },
        ],
        skip: (page - 1) * page_size,
        take: page_size,
      }),
      this.db.partidaContable.count({
        where: {
          cuenta_id: cuentaIdReal,
          comprobante: {
            estado,
            ...(fechaFilter ? { fecha_comprobante: fechaFilter } : {}),
          },
        },
      }),
    ]);

    let saldoAcum = saldo_inicial;
    const items = movimientos.map((p) => {
      const debe = p.tipo === TipoMovimientoContable.DEBE ? Number(p.monto) : 0;
      const haber = p.tipo === TipoMovimientoContable.HABER ? Number(p.monto) : 0;
      saldoAcum = esDeudora ? saldoAcum + debe - haber : saldoAcum + haber - debe;
      return {
        fecha: p.comprobante.fecha_comprobante,
        comprobante_id: p.comprobante.id,
        tipo: p.comprobante.tipo.nombre,
        numero: p.comprobante.numero,
        glosa: p.glosa ?? p.comprobante.descripcion,
        debe,
        haber,
        saldo: saldoAcum,
      };
    });

    const totales = items.reduce(
      (acc, i) => ({ debe: acc.debe + i.debe, haber: acc.haber + i.haber }),
      { debe: 0, haber: 0 },
    );

    return {
      cuenta: {
        id: cuenta.id,
        codigo: cuenta.codigo,
        nombre: cuenta.nombre,
        naturaleza: cuenta.naturaleza,
        tipo: cuenta.tipo,
      },
      saldo_inicial,
      movimientos: items,
      totales,
      saldo_final: saldoAcum,
      pagination: { page, page_size, total: totalMovs },
    };
  }

  async getBalanceComprobacion(params: BalanceParams) {
    const {
      estado = EstadoComprobante.APROBADO,
      nivel,
      incluir_cuentas_sin_movimiento = false,
    } = params;

    const fechaFilter = buildFechaFilter(params);

    const partidas = await this.db.partidaContable.findMany({
      where: {
        comprobante: {
          estado,
          ...(fechaFilter ? { fecha_comprobante: fechaFilter } : {}),
        },
      },
      include: {
        cuenta: { select: { id: true, codigo: true, nombre: true, tipo: true, naturaleza: true, nivel: true } },
      },
    });

    // aggregate by cuenta
    const map = new Map<
      number,
      { cuenta: (typeof partidas)[0]["cuenta"]; debe: number; haber: number }
    >();
    for (const p of partidas) {
      const c = p.cuenta;
      if (nivel !== undefined && c.nivel !== nivel) continue;
      const existing = map.get(c.id) ?? { cuenta: c, debe: 0, haber: 0 };
      if (p.tipo === TipoMovimientoContable.DEBE) existing.debe += Number(p.monto);
      else existing.haber += Number(p.monto);
      map.set(c.id, existing);
    }

    if (incluir_cuentas_sin_movimiento) {
      const todasCuentas = await this.db.cuentaContable.findMany({
        where: nivel !== undefined ? { nivel } : {},
        select: { id: true, codigo: true, nombre: true, tipo: true, naturaleza: true, nivel: true },
      });
      for (const c of todasCuentas) {
        if (!map.has(c.id)) map.set(c.id, { cuenta: c, debe: 0, haber: 0 });
      }
    }

    const items = Array.from(map.values())
      .sort((a, b) => a.cuenta.codigo.localeCompare(b.cuenta.codigo))
      .map(({ cuenta, debe, haber }) => {
        const saldo_deudor = Math.max(0, debe - haber);
        const saldo_acreedor = Math.max(0, haber - debe);
        const esResultado = CUENTAS_RESULTADO.includes(cuenta.tipo);
        const esInventario = CUENTAS_INVENTARIO.includes(cuenta.tipo);
        return {
          cuenta_codigo: cuenta.codigo,
          cuenta_nombre: cuenta.nombre,
          tipo: cuenta.tipo,
          naturaleza: cuenta.naturaleza,
          sumas_debe: debe,
          sumas_haber: haber,
          saldo_deudor,
          saldo_acreedor,
          resultado_deudor: esResultado ? saldo_deudor : 0,
          resultado_acreedor: esResultado ? saldo_acreedor : 0,
          inventario_activo: esInventario && cuenta.tipo === TipoCuentaContable.ACTIVO ? saldo_deudor : 0,
          inventario_pasivo:
            esInventario && cuenta.tipo !== TipoCuentaContable.ACTIVO ? saldo_acreedor : 0,
        };
      });

    const totales = items.reduce(
      (acc, i) => ({
        sumas_debe: acc.sumas_debe + i.sumas_debe,
        sumas_haber: acc.sumas_haber + i.sumas_haber,
        saldo_deudor: acc.saldo_deudor + i.saldo_deudor,
        saldo_acreedor: acc.saldo_acreedor + i.saldo_acreedor,
      }),
      { sumas_debe: 0, sumas_haber: 0, saldo_deudor: 0, saldo_acreedor: 0 },
    );

    return { items, totales };
  }

  async getEstadoResultados(params: EstadoResultadosParams) {
    const { estado = EstadoComprobante.APROBADO, fecha_desde, fecha_hasta } = params;

    const fechaFilter = buildFechaFilter({ fecha_desde, fecha_hasta });

    const partidas = await this.db.partidaContable.findMany({
      where: {
        comprobante: {
          estado,
          ...(fechaFilter ? { fecha_comprobante: fechaFilter } : {}),
        },
        cuenta: {
          tipo: { in: [TipoCuentaContable.INGRESO, TipoCuentaContable.GASTO, TipoCuentaContable.COSTO] },
        },
      },
      include: {
        cuenta: { select: { id: true, codigo: true, nombre: true, tipo: true } },
      },
    });

    // aggregate per cuenta
    const mapIng = new Map<number, { codigo: string; nombre: string; monto: number }>();
    const mapGasto = new Map<number, { codigo: string; nombre: string; monto: number }>();

    for (const p of partidas) {
      const monto = Number(p.monto);
      if (p.cuenta.tipo === TipoCuentaContable.INGRESO) {
        const e = mapIng.get(p.cuenta.id) ?? { codigo: p.cuenta.codigo, nombre: p.cuenta.nombre, monto: 0 };
        // ingreso neto = haber - debe (notas de crédito reducen ingresos)
        e.monto += p.tipo === TipoMovimientoContable.HABER ? monto : -monto;
        mapIng.set(p.cuenta.id, e);
      } else {
        const e = mapGasto.get(p.cuenta.id) ?? { codigo: p.cuenta.codigo, nombre: p.cuenta.nombre, monto: 0 };
        // gasto = debe - haber
        e.monto += p.tipo === TipoMovimientoContable.DEBE ? monto : -monto;
        mapGasto.set(p.cuenta.id, e);
      }
    }

    const ingresos = Array.from(mapIng.values())
      .sort((a, b) => a.codigo.localeCompare(b.codigo))
      .map((e) => ({ cuenta_codigo: e.codigo, cuenta_nombre: e.nombre, monto: e.monto }));

    const gastos = Array.from(mapGasto.values())
      .sort((a, b) => a.codigo.localeCompare(b.codigo))
      .map((e) => ({ cuenta_codigo: e.codigo, cuenta_nombre: e.nombre, monto: e.monto }));

    const totalIngresos = ingresos.reduce((s, i) => s + i.monto, 0);
    const totalGastos = gastos.reduce((s, g) => s + g.monto, 0);

    const result = {
      periodo: {
        desde: fecha_desde?.toISOString().slice(0, 10) ?? null,
        hasta: fecha_hasta?.toISOString().slice(0, 10) ?? null,
      },
      ingresos,
      gastos,
      totales: {
        ingresos: totalIngresos,
        gastos: totalGastos,
        utilidad: totalIngresos - totalGastos,
      },
    };

    if (!params.comparar_con_periodo_anterior || !fecha_desde || !fecha_hasta) return result;

    const diff = fecha_hasta.getTime() - fecha_desde.getTime();
    const anteriorDesde = new Date(fecha_desde.getTime() - diff - 86400000);
    const anteriorHasta = new Date(fecha_desde.getTime() - 86400000);

    const anterior = await this.getEstadoResultados({ estado, fecha_desde: anteriorDesde, fecha_hasta: anteriorHasta }) as typeof result;
    return { ...result, periodo_anterior: anterior };
  }

  async getSaldoBancario(cuentaId: number) {
    const cuenta = await this.db.cuentaBancaria.findUnique({
      where: { id: cuentaId },
      select: { id: true, nombre: true, numero_cuenta: true, saldo_inicial: true, activa: true, tipo_cuenta: true },
    });
    if (!cuenta) throw new Error(`Cuenta bancaria #${cuentaId} no encontrada`);

    const agg = await this.db.movimientoTesoreria.groupBy({
      by: ["tipo"],
      where: { cuenta_id: cuentaId },
      _sum: { monto: true },
    });

    const ingresos = agg.find((r) => r.tipo === "INGRESO")?._sum?.monto ?? 0;
    const egresos = agg.find((r) => r.tipo === "EGRESO")?._sum?.monto ?? 0;
    const saldo = Number(cuenta.saldo_inicial) + Number(ingresos) - Number(egresos);

    return {
      ...cuenta,
      ingresos: Number(ingresos),
      egresos: Number(egresos),
      saldo_calculado: saldo,
    };
  }
}
