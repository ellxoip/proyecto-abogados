import {
  ComprobanteContable,
  CuentaContable,
  EstadoComprobante,
  NaturalezaCuenta,
  PrismaClient,
  TipoComprobanteContable,
  TipoMovimientoContable,
} from "@prisma/client";

type PrismaTransaction = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export interface PartidaInput {
  codigo_cuenta: string;
  tipo: "DEBE" | "HABER";
  monto: number;
  glosa?: string;
}

export interface CrearComprobanteParams {
  tipo_nombre: string;
  fecha: Date;
  descripcion: string;
  partidas: PartidaInput[];
  empresa_id?: number | null;
  usuario_id?: number | null;
}

export class ContabilidadService {
  constructor(private readonly db: PrismaClient | PrismaTransaction) {}

  async validarPeriodoAbierto(fecha: Date, empresa_id?: number | null): Promise<void> {
    const periodo = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
    const anio = String(fecha.getFullYear());

    const cierre = await this.db.cierreContable.findFirst({
      where: {
        empresa_id: empresa_id ?? null,
        OR: [
          { tipo: "MENSUAL", periodo },
          { tipo: "ANUAL", periodo: anio },
        ],
      },
    });

    if (cierre) {
      throw new Error(
        `Período ${cierre.periodo} está cerrado (cierre ${cierre.tipo.toLowerCase()} del ${cierre.fecha_cierre.toISOString().slice(0, 10)})`,
      );
    }
  }

  async crearComprobanteAutomatico(
    params: CrearComprobanteParams,
  ): Promise<ComprobanteContable> {
    const { tipo_nombre, fecha, descripcion, partidas, empresa_id, usuario_id } = params;

    await this.validarPeriodoAbierto(fecha, empresa_id);

    const tipo = await this.db.tipoComprobanteContable.findFirst({
      where: { nombre: tipo_nombre, ...(empresa_id != null ? { empresa_id } : {}) },
    });
    if (!tipo) {
      throw new Error(`Tipo de comprobante "${tipo_nombre}" no encontrado`);
    }

    const cuentasResueltas = await Promise.all(
      partidas.map(async (p) => {
        const cuenta = await this.db.cuentaContable.findFirst({
          where: {
            codigo: p.codigo_cuenta,
            ...(empresa_id != null ? { empresa_id } : {}),
          },
        });
        if (!cuenta) {
          throw new Error(`Cuenta contable "${p.codigo_cuenta}" no encontrada`);
        }
        if (!cuenta.acepta_movimientos) {
          throw new Error(
            `Cuenta "${p.codigo_cuenta} - ${cuenta.nombre}" no acepta movimientos directos`,
          );
        }
        return { ...p, cuenta };
      }),
    );

    const totalDebe = cuentasResueltas
      .filter((p) => p.tipo === "DEBE")
      .reduce((s, p) => s + p.monto, 0);
    const totalHaber = cuentasResueltas
      .filter((p) => p.tipo === "HABER")
      .reduce((s, p) => s + p.monto, 0);

    if (Math.abs(totalDebe - totalHaber) > 0.01) {
      throw new Error(
        `Comprobante no cuadra: debe=${totalDebe.toFixed(2)} haber=${totalHaber.toFixed(2)}`,
      );
    }

    const [comprobante] = await (this.db as PrismaClient).$transaction([
      this.db.comprobanteContable.create({
        data: {
          tipo_id: tipo.id,
          numero: tipo.siguiente_numero,
          fecha_comprobante: fecha,
          descripcion,
          estado: EstadoComprobante.APROBADO,
          total_debe: totalDebe,
          total_haber: totalHaber,
          ...(empresa_id != null ? { empresa_id } : {}),
          ...(usuario_id != null ? { usuario_id } : {}),
          partidas: {
            create: cuentasResueltas.map((p) => ({
              cuenta_id: p.cuenta.id,
              tipo: p.tipo === "DEBE" ? TipoMovimientoContable.DEBE : TipoMovimientoContable.HABER,
              monto: p.monto,
              glosa: p.glosa ?? null,
            })),
          },
        },
      }),
      this.db.tipoComprobanteContable.update({
        where: { id: tipo.id },
        data: { siguiente_numero: { increment: 1 } },
      }),
    ]);

    return comprobante;
  }

  async anularComprobanteConContraasiento(
    comprobanteId: number,
    motivo: string,
    usuario_id?: number | null,
  ): Promise<ComprobanteContable> {
    const original = await this.db.comprobanteContable.findUnique({
      where: { id: comprobanteId },
      include: {
        partidas: { include: { cuenta: true } },
        tipo: true,
      },
    });

    if (!original) throw new Error(`Comprobante #${comprobanteId} no encontrado`);
    if (original.estado === EstadoComprobante.ANULADO) {
      throw new Error(`Comprobante #${comprobanteId} ya está anulado`);
    }
    if (original.estado !== EstadoComprobante.APROBADO) {
      throw new Error(
        `Solo se pueden anular comprobantes aprobados. Estado actual: ${original.estado}`,
      );
    }

    const partidasInversas: PartidaInput[] = original.partidas.map((p) => ({
      codigo_cuenta: p.cuenta.codigo,
      tipo: p.tipo === TipoMovimientoContable.DEBE ? "HABER" : "DEBE",
      monto: Number(p.monto),
      glosa: `Contraasiento: ${p.glosa ?? original.descripcion}`,
    }));

    const tipoReversa = await this.db.tipoComprobanteContable.findFirst({
      where: {
        nombre: "REVERSA",
        ...(original.empresa_id != null ? { empresa_id: original.empresa_id } : {}),
      },
    });
    if (!tipoReversa) throw new Error('Tipo de comprobante "REVERSA" no configurado');

    const [contraasiento] = await (this.db as PrismaClient).$transaction([
      this.db.comprobanteContable.create({
        data: {
          tipo_id: tipoReversa.id,
          numero: tipoReversa.siguiente_numero,
          fecha_comprobante: new Date(),
          descripcion: `Anulación #${comprobanteId}: ${motivo}`,
          estado: EstadoComprobante.APROBADO,
          total_debe: Number(original.total_haber),
          total_haber: Number(original.total_debe),
          ...(original.empresa_id != null ? { empresa_id: original.empresa_id } : {}),
          ...(usuario_id != null ? { usuario_id } : {}),
          partidas: {
            create: partidasInversas.map((p) => {
              const cuenta = original.partidas.find((op) => op.cuenta.codigo === p.codigo_cuenta)!;
              return {
                cuenta_id: cuenta.cuenta_id,
                tipo: p.tipo === "DEBE" ? TipoMovimientoContable.DEBE : TipoMovimientoContable.HABER,
                monto: p.monto,
                glosa: p.glosa ?? null,
              };
            }),
          },
        },
      }),
      this.db.tipoComprobanteContable.update({
        where: { id: tipoReversa.id },
        data: { siguiente_numero: { increment: 1 } },
      }),
      this.db.comprobanteContable.update({
        where: { id: comprobanteId },
        data: { estado: EstadoComprobante.ANULADO },
      }),
    ]);

    return contraasiento;
  }

  async resolverContexto(
    codigos: string[],
    tipoNombre: string,
    fecha: Date,
    empresa_id?: number | null,
  ): Promise<{ cuentas: Map<string, CuentaContable>; tipo: TipoComprobanteContable }> {
    await this.validarPeriodoAbierto(fecha, empresa_id);

    const [cuentasArr, tipo] = await Promise.all([
      Promise.all(
        codigos.map((codigo) =>
          this.db.cuentaContable.findFirst({
            where: { codigo, ...(empresa_id != null ? { empresa_id } : {}) },
          }),
        ),
      ),
      this.db.tipoComprobanteContable.findFirst({
        where: { nombre: tipoNombre, ...(empresa_id != null ? { empresa_id } : {}) },
      }),
    ]);

    const cuentas = new Map<string, CuentaContable>();
    for (let i = 0; i < codigos.length; i++) {
      const c = cuentasArr[i];
      if (!c) throw new Error(`Cuenta contable "${codigos[i]}" no encontrada`);
      if (!c.acepta_movimientos)
        throw new Error(`Cuenta "${codigos[i]} - ${c.nombre}" no acepta movimientos directos`);
      cuentas.set(codigos[i], c);
    }

    if (!tipo) throw new Error(`Tipo de comprobante "${tipoNombre}" no configurado`);

    return { cuentas, tipo };
  }

  static esNaturalezaCorrecta(
    tipo: "DEBE" | "HABER",
    naturaleza: NaturalezaCuenta,
  ): boolean {
    return (
      (tipo === "DEBE" && naturaleza === NaturalezaCuenta.DEUDORA) ||
      (tipo === "HABER" && naturaleza === NaturalezaCuenta.ACREEDORA)
    );
  }
}
