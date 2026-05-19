import { EstadoCuota, EstadoContrato, EstadoPago, TipoCliente, TipoModificacion } from "@prisma/client";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";

function toN(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  if (v && typeof v === "object" && "toString" in v) return Number((v as { toString(): string }).toString());
  return 0;
}

function toDate(v: Date): string {
  return v.toISOString().slice(0, 10);
}

// ── 1. Efectividad de cobranza ────────────────────────────────────────────────

export type EfectividadRow = {
  periodo: string;
  gestiones: number;
  cobradas: number;
  montoCobrado: number;
  tasa: number;
  delta: number | null;
};

export async function reportEfectividadCobranza(filters: { from?: Date; to?: Date } = {}) {
  const dateGestion = filters.from || filters.to
    ? { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) }
    : undefined;
  const datePago = filters.from || filters.to
    ? { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) }
    : undefined;

  const [modificaciones, pagos] = await Promise.all([
    prisma.modificacionContrato.findMany({
      where: dateGestion ? { created_at: dateGestion } : undefined,
      select: { created_at: true },
    }),
    prisma.pago.findMany({
      where: { estado: EstadoPago.CONFIRMADO, ...(datePago ? { fecha_pago: datePago } : {}) },
      select: { fecha_pago: true, monto_pagado: true },
    }),
  ]);

  const gMap = new Map<string, number>();
  for (const m of modificaciones) {
    const k = format(m.created_at, "yyyy-MM");
    gMap.set(k, (gMap.get(k) ?? 0) + 1);
  }

  const pMap = new Map<string, { count: number; monto: number }>();
  for (const p of pagos) {
    const k = format(p.fecha_pago, "yyyy-MM");
    const cur = pMap.get(k) ?? { count: 0, monto: 0 };
    pMap.set(k, { count: cur.count + 1, monto: cur.monto + toN(p.monto_pagado) });
  }

  const periods = new Set([...gMap.keys(), ...pMap.keys()]);
  const rows: EfectividadRow[] = Array.from(periods)
    .sort()
    .reverse()
    .map((periodo) => {
      const gestiones = gMap.get(periodo) ?? 0;
      const { count: cobradas, monto: montoCobrado } = pMap.get(periodo) ?? { count: 0, monto: 0 };
      return {
        periodo,
        gestiones,
        cobradas,
        montoCobrado,
        tasa: gestiones > 0 ? Math.round((cobradas / gestiones) * 1000) / 10 : 0,
        delta: null,
      };
    });

  for (let i = 0; i < rows.length - 1; i++) {
    rows[i].delta = Math.round((rows[i].tasa - rows[i + 1].tasa) * 10) / 10;
  }

  const totalGestiones = rows.reduce((s, r) => s + r.gestiones, 0);
  const totalCobradas = rows.reduce((s, r) => s + r.cobradas, 0);
  return {
    rows,
    summary: {
      totalGestiones,
      totalCobradas,
      totalMonto: rows.reduce((s, r) => s + r.montoCobrado, 0),
      tasaGlobal: totalGestiones > 0 ? Math.round((totalCobradas / totalGestiones) * 1000) / 10 : 0,
    },
  };
}

// ── 2. Compromisos de pago ────────────────────────────────────────────────────

export type CompromisoRow = {
  clienteId: number;
  clienteNombre: string;
  clienteRut: string;
  contratoId: number;
  contratoServicio: string;
  montoTotal: number;
  montoVencido: number;
  proximaFecha: string | null;
  estado: "ACTIVO" | "INCUMPLIDO" | "CUMPLIDO";
};

export async function reportCompromisosPago(filters: { estado?: string } = {}) {
  const now = new Date();
  const contratos = await prisma.contrato.findMany({
    where: { estado: EstadoContrato.REPACTADO },
    select: {
      id: true,
      tipo_servicio: true,
      cliente: { select: { id: true, nombre: true, rut: true } },
      cuotas: {
        where: { estado: { notIn: [EstadoCuota.ANULADA, EstadoCuota.CONDONADA, EstadoCuota.REEMPLAZADA] } },
        select: { saldo_pendiente: true, fecha_vencimiento: true },
      },
    },
  });

  const rows: CompromisoRow[] = contratos.map((contrato) => {
    const pending = contrato.cuotas.filter((c) => toN(c.saldo_pendiente) > 0);
    const vencidas = pending.filter((c) => c.fecha_vencimiento < now);
    const futuras = pending
      .filter((c) => c.fecha_vencimiento >= now)
      .sort((a, b) => a.fecha_vencimiento.getTime() - b.fecha_vencimiento.getTime());

    const estado: "ACTIVO" | "INCUMPLIDO" | "CUMPLIDO" =
      pending.length === 0 ? "CUMPLIDO" : vencidas.length > 0 ? "INCUMPLIDO" : "ACTIVO";

    return {
      clienteId: contrato.cliente.id,
      clienteNombre: contrato.cliente.nombre,
      clienteRut: contrato.cliente.rut,
      contratoId: contrato.id,
      contratoServicio: contrato.tipo_servicio,
      montoTotal: pending.reduce((s, c) => s + toN(c.saldo_pendiente), 0),
      montoVencido: vencidas.reduce((s, c) => s + toN(c.saldo_pendiente), 0),
      proximaFecha: futuras[0]?.fecha_vencimiento.toISOString().slice(0, 10) ?? null,
      estado,
    };
  });

  const filtered = filters.estado ? rows.filter((r) => r.estado === filters.estado) : rows;
  filtered.sort((a, b) => {
    const order = { INCUMPLIDO: 0, ACTIVO: 1, CUMPLIDO: 2 };
    return order[a.estado] - order[b.estado];
  });

  return {
    rows: filtered,
    summary: {
      activos: rows.filter((r) => r.estado === "ACTIVO").length,
      incumplidos: rows.filter((r) => r.estado === "INCUMPLIDO").length,
      cumplidos: rows.filter((r) => r.estado === "CUMPLIDO").length,
      tasa: rows.length > 0 ? Math.round((rows.filter((r) => r.estado === "CUMPLIDO").length / rows.length) * 1000) / 10 : 0,
    },
  };
}

// ── 3. Clientes nuevos por mes ────────────────────────────────────────────────

export type ClientesNuevosRow = {
  periodo: string;
  total: number;
  personas: number;
  empresas: number;
};

export async function reportClientesNuevos(filters: { from?: Date; to?: Date } = {}) {
  const clientes = await prisma.cliente.findMany({
    where:
      filters.from || filters.to
        ? {
            fecha_ingreso: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : undefined,
    select: { fecha_ingreso: true, tipo_cliente: true },
    orderBy: { fecha_ingreso: "asc" },
  });

  const map = new Map<string, { personas: number; empresas: number }>();
  for (const c of clientes) {
    const k = format(c.fecha_ingreso, "yyyy-MM");
    const cur = map.get(k) ?? { personas: 0, empresas: 0 };
    if (c.tipo_cliente === TipoCliente.PERSONA) cur.personas++;
    else cur.empresas++;
    map.set(k, cur);
  }

  const rows: ClientesNuevosRow[] = Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([periodo, { personas, empresas }]) => ({ periodo, total: personas + empresas, personas, empresas }));

  return {
    rows,
    summary: {
      total: clientes.length,
      personas: clientes.filter((c) => c.tipo_cliente === TipoCliente.PERSONA).length,
      empresas: clientes.filter((c) => c.tipo_cliente === TipoCliente.EMPRESA).length,
    },
  };
}

// ── 4. Distribución PERSONA vs EMPRESA ───────────────────────────────────────

export type DistribucionRow = {
  tipo: string;
  clientes: number;
  contratos: number;
  montoTotal: number;
  deudaActiva: number;
  morosos: number;
};

export async function reportDistribucionClientes() {
  const clientes = await prisma.cliente.findMany({
    select: {
      tipo_cliente: true,
      contratos: {
        select: {
          monto_ccto: true,
          cuotas: {
            where: { estado: { in: [EstadoCuota.PENDIENTE, EstadoCuota.VENCIDA, EstadoCuota.PARCIAL] } },
            select: { saldo_pendiente: true },
          },
        },
      },
    },
  });

  const acc = {
    PERSONA: { clientes: 0, contratos: 0, montoTotal: 0, deudaActiva: 0, morosos: 0 },
    EMPRESA: { clientes: 0, contratos: 0, montoTotal: 0, deudaActiva: 0, morosos: 0 },
  };

  for (const c of clientes) {
    const tipo = c.tipo_cliente === TipoCliente.PERSONA ? "PERSONA" : "EMPRESA";
    acc[tipo].clientes++;
    acc[tipo].contratos += c.contratos.length;
    acc[tipo].montoTotal += c.contratos.reduce((s, ct) => s + toN(ct.monto_ccto), 0);
    const deuda = c.contratos.flatMap((ct) => ct.cuotas).reduce((s, cu) => s + toN(cu.saldo_pendiente), 0);
    acc[tipo].deudaActiva += deuda;
    if (deuda > 0) acc[tipo].morosos++;
  }

  return {
    rows: [
      { tipo: "PERSONA", ...acc.PERSONA },
      { tipo: "EMPRESA", ...acc.EMPRESA },
    ] as DistribucionRow[],
    total: clientes.length,
  };
}

// ── 5. Retención / Churn ──────────────────────────────────────────────────────

export type RetencionRow = {
  periodo: string;
  nuevos: number;
  finalizados: number;
  anulados: number;
  tasaRetencion: number;
};

export async function reportRetencion(filters: { from?: Date; to?: Date } = {}) {
  const clientes = await prisma.cliente.findMany({
    select: { fecha_ingreso: true, estado: true, updated_at: true },
  });

  const nuevosMap = new Map<string, number>();
  const finMap = new Map<string, number>();
  const anulMap = new Map<string, number>();

  for (const c of clientes) {
    const kN = format(c.fecha_ingreso, "yyyy-MM");
    nuevosMap.set(kN, (nuevosMap.get(kN) ?? 0) + 1);

    if (c.estado === "FINALIZADO") {
      const k = format(c.updated_at, "yyyy-MM");
      finMap.set(k, (finMap.get(k) ?? 0) + 1);
    }
    if (c.estado === "ANULADO") {
      const k = format(c.updated_at, "yyyy-MM");
      anulMap.set(k, (anulMap.get(k) ?? 0) + 1);
    }
  }

  const periods = new Set([...nuevosMap.keys(), ...finMap.keys(), ...anulMap.keys()]);
  const rows: RetencionRow[] = Array.from(periods)
    .sort()
    .reverse()
    .map((periodo) => {
      const nuevos = nuevosMap.get(periodo) ?? 0;
      const finalizados = finMap.get(periodo) ?? 0;
      const anulados = anulMap.get(periodo) ?? 0;
      const bajas = finalizados + anulados;
      return {
        periodo,
        nuevos,
        finalizados,
        anulados,
        tasaRetencion: nuevos > 0 ? Math.round((1 - bajas / nuevos) * 1000) / 10 : 100,
      };
    });

  return {
    rows,
    summary: {
      totalActivos: clientes.filter((c) => ["ACTIVO", "AL_DIA", "MOROSO"].includes(c.estado)).length,
      totalFinalizados: clientes.filter((c) => c.estado === "FINALIZADO").length,
      totalAnulados: clientes.filter((c) => c.estado === "ANULADO").length,
      total: clientes.length,
    },
  };
}

// ── 6. LTV por cliente ────────────────────────────────────────────────────────

export type LtvRow = {
  clienteId: number;
  nombre: string;
  rut: string;
  tipo: string;
  contratos: number;
  contratado: number;
  pagado: number;
  saldo: number;
};

export async function reportLTV(filters: { q?: string } = {}) {
  const clientes = await prisma.cliente.findMany({
    where: filters.q
      ? { OR: [{ nombre: { contains: filters.q } }, { rut: { contains: filters.q } }] }
      : undefined,
    select: {
      id: true,
      nombre: true,
      rut: true,
      tipo_cliente: true,
      contratos: {
        select: {
          monto_ccto: true,
          pagos: { where: { estado: EstadoPago.CONFIRMADO }, select: { monto_pagado: true } },
          cuotas: { select: { saldo_pendiente: true } },
        },
      },
    },
    orderBy: { nombre: "asc" },
  });

  const rows: LtvRow[] = clientes
    .map((c) => ({
      clienteId: c.id,
      nombre: c.nombre,
      rut: c.rut,
      tipo: c.tipo_cliente,
      contratos: c.contratos.length,
      contratado: c.contratos.reduce((s, ct) => s + toN(ct.monto_ccto), 0),
      pagado: c.contratos.flatMap((ct) => ct.pagos).reduce((s, p) => s + toN(p.monto_pagado), 0),
      saldo: c.contratos.flatMap((ct) => ct.cuotas).reduce((s, cu) => s + toN(cu.saldo_pendiente), 0),
    }))
    .sort((a, b) => b.contratado - a.contratado);

  return {
    rows,
    summary: {
      totalClientes: rows.length,
      totalContratado: rows.reduce((s, r) => s + r.contratado, 0),
      totalPagado: rows.reduce((s, r) => s + r.pagado, 0),
      totalSaldo: rows.reduce((s, r) => s + r.saldo, 0),
    },
  };
}

// ── 7. Cartera por tipo de servicio ───────────────────────────────────────────

export type CarteraServicioRow = {
  servicio: string;
  contratos: number;
  montoTotal: number;
  pagado: number;
  saldo: number;
  pctRevenue: number;
};

export async function reportCarteraServicios(filters: { from?: Date; to?: Date } = {}) {
  const contratos = await prisma.contrato.findMany({
    where:
      filters.from || filters.to
        ? {
            fecha_contrato: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : undefined,
    select: {
      tipo_servicio: true,
      monto_ccto: true,
      pagos: { where: { estado: EstadoPago.CONFIRMADO }, select: { monto_pagado: true } },
      cuotas: { select: { saldo_pendiente: true } },
    },
  });

  const map = new Map<string, { contratos: number; montoTotal: number; pagado: number; saldo: number }>();
  for (const c of contratos) {
    const cur = map.get(c.tipo_servicio) ?? { contratos: 0, montoTotal: 0, pagado: 0, saldo: 0 };
    cur.contratos++;
    cur.montoTotal += toN(c.monto_ccto);
    cur.pagado += c.pagos.reduce((s, p) => s + toN(p.monto_pagado), 0);
    cur.saldo += c.cuotas.reduce((s, cu) => s + toN(cu.saldo_pendiente), 0);
    map.set(c.tipo_servicio, cur);
  }

  const totalRevenue = Array.from(map.values()).reduce((s, v) => s + v.montoTotal, 0);
  const rows: CarteraServicioRow[] = Array.from(map.entries())
    .map(([servicio, data]) => ({
      servicio,
      ...data,
      pctRevenue: totalRevenue > 0 ? Math.round((data.montoTotal / totalRevenue) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.montoTotal - a.montoTotal);

  return {
    rows,
    summary: {
      totalServicios: rows.length,
      totalContratos: contratos.length,
      totalRevenue,
      totalPagado: rows.reduce((s, r) => s + r.pagado, 0),
      totalSaldo: rows.reduce((s, r) => s + r.saldo, 0),
    },
  };
}

// ── 8. Modificaciones de contrato ─────────────────────────────────────────────

export type ModificacionRow = {
  id: number;
  fecha: string;
  tipo: string;
  clienteNombre: string;
  clienteId: number;
  contratoId: number;
  contratoServicio: string;
  usuario: string;
  motivo: string;
};

export async function reportModificaciones(filters: { from?: Date; to?: Date; tipo?: string } = {}) {
  const mods = await prisma.modificacionContrato.findMany({
    where: {
      ...(filters.from || filters.to
        ? { created_at: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
      ...(filters.tipo ? { tipo_modificacion: filters.tipo as TipoModificacion } : {}),
    },
    select: {
      id: true,
      created_at: true,
      tipo_modificacion: true,
      motivo: true,
      contrato: {
        select: {
          id: true,
          tipo_servicio: true,
          cliente: { select: { id: true, nombre: true } },
        },
      },
      usuario: { select: { nombre: true } },
    },
    orderBy: { created_at: "desc" },
  });

  const rows: ModificacionRow[] = mods.map((m) => ({
    id: m.id,
    fecha: toDate(m.created_at),
    tipo: m.tipo_modificacion,
    clienteNombre: m.contrato.cliente.nombre,
    clienteId: m.contrato.cliente.id,
    contratoId: m.contrato.id,
    contratoServicio: m.contrato.tipo_servicio,
    usuario: m.usuario.nombre,
    motivo: m.motivo,
  }));

  const byTipo = rows.reduce(
    (acc, r) => { acc[r.tipo] = (acc[r.tipo] ?? 0) + 1; return acc; },
    {} as Record<string, number>,
  );

  return { rows, summary: { total: rows.length, byTipo } };
}

// ── 9. Condonaciones ──────────────────────────────────────────────────────────

export type CondonacionRow = {
  id: number;
  fecha: string;
  clienteNombre: string;
  clienteId: number;
  contratoId: number;
  contratoServicio: string;
  montoCondonado: number;
  usuario: string;
  motivo: string;
};

export async function reportCondonaciones(filters: { from?: Date; to?: Date } = {}) {
  const cuotas = await prisma.cuota.findMany({
    where: { estado: EstadoCuota.CONDONADA },
    select: {
      id: true,
      monto_actual: true,
      contrato: {
        select: { id: true, tipo_servicio: true, cliente: { select: { id: true, nombre: true } } },
      },
      modificaciones: {
        where: { tipo_modificacion: TipoModificacion.CONDONACION },
        orderBy: { created_at: "desc" },
        take: 1,
        select: { created_at: true, motivo: true, usuario: { select: { nombre: true } } },
      },
    },
  });

  const rows: CondonacionRow[] = cuotas
    .filter((c) => c.modificaciones.length > 0)
    .filter((c) => {
      const fecha = c.modificaciones[0].created_at;
      if (filters.from && fecha < filters.from) return false;
      if (filters.to && fecha > filters.to) return false;
      return true;
    })
    .map((c) => {
      const mod = c.modificaciones[0];
      return {
        id: c.id,
        fecha: toDate(mod.created_at),
        clienteNombre: c.contrato.cliente.nombre,
        clienteId: c.contrato.cliente.id,
        contratoId: c.contrato.id,
        contratoServicio: c.contrato.tipo_servicio,
        montoCondonado: toN(c.monto_actual),
        usuario: mod.usuario.nombre,
        motivo: mod.motivo,
      };
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  const byUsuario = rows.reduce(
    (acc, r) => {
      const cur = acc[r.usuario] ?? { count: 0, monto: 0 };
      acc[r.usuario] = { count: cur.count + 1, monto: cur.monto + r.montoCondonado };
      return acc;
    },
    {} as Record<string, { count: number; monto: number }>,
  );

  return {
    rows,
    summary: {
      total: rows.length,
      totalCondonado: rows.reduce((s, r) => s + r.montoCondonado, 0),
      byUsuario,
    },
  };
}

// ── 10. Casos legales ─────────────────────────────────────────────────────────

export type CasoLegalRow = {
  id: number;
  codigo: string;
  titulo: string;
  clienteNombre: string;
  clienteId: number;
  estado: string;
  fechaApertura: string;
  fechaCierre: string | null;
  diasAbierto: number;
  tieneContrato: boolean;
};

export async function reportCasosLegales(filters: { estado?: string; from?: Date; to?: Date } = {}) {
  const casos = await prisma.casoLegal.findMany({
    where: {
      ...(filters.estado ? { estado: filters.estado } : {}),
      ...(filters.from || filters.to
        ? { fecha_apertura: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
    },
    select: {
      id: true,
      codigo_interno: true,
      titulo: true,
      estado: true,
      fecha_apertura: true,
      fecha_cierre: true,
      contrato_id: true,
      cliente: { select: { id: true, nombre: true } },
    },
    orderBy: { fecha_apertura: "desc" },
  });

  const now = new Date();
  const rows: CasoLegalRow[] = casos.map((caso) => {
    const end = caso.fecha_cierre ?? now;
    return {
      id: caso.id,
      codigo: caso.codigo_interno ?? `CASO-${caso.id}`,
      titulo: caso.titulo,
      clienteNombre: caso.cliente.nombre,
      clienteId: caso.cliente.id,
      estado: caso.estado,
      fechaApertura: toDate(caso.fecha_apertura),
      fechaCierre: caso.fecha_cierre ? toDate(caso.fecha_cierre) : null,
      diasAbierto: Math.max(0, Math.floor((end.getTime() - caso.fecha_apertura.getTime()) / 86400000)),
      tieneContrato: caso.contrato_id !== null,
    };
  });

  const cerrados = rows.filter((r) => r.estado !== "ABIERTO");
  return {
    rows,
    summary: {
      total: rows.length,
      abiertos: rows.filter((r) => r.estado === "ABIERTO").length,
      cerrados: cerrados.length,
      duracionPromedio: cerrados.length > 0
        ? Math.round(cerrados.reduce((s, r) => s + r.diasAbierto, 0) / cerrados.length)
        : 0,
      conContrato: rows.filter((r) => r.tieneContrato).length,
    },
  };
}

// ── 11. Cuotas: casos legales vs regulares ────────────────────────────────────

export type CuotasCasosRow = {
  tipo: string;
  cuotas: number;
  montoTotal: number;
  pagadas: number;
  pendientes: number;
  vencidas: number;
  tasaPago: number;
};

export async function reportCuotasCasosVsRegulares() {
  const cuotas = await prisma.cuota.findMany({
    select: { caso_legal_id: true, estado: true, monto_actual: true },
  });

  function summarize(list: typeof cuotas, tipo: string): CuotasCasosRow {
    const pagadas = list.filter((c) =>
      c.estado === EstadoCuota.PAGADA || c.estado === EstadoCuota.CONDONADA,
    ).length;
    return {
      tipo,
      cuotas: list.length,
      montoTotal: list.reduce((s, c) => s + toN(c.monto_actual), 0),
      pagadas,
      pendientes: list.filter((c) => c.estado === EstadoCuota.PENDIENTE || c.estado === EstadoCuota.PARCIAL).length,
      vencidas: list.filter((c) => c.estado === EstadoCuota.VENCIDA).length,
      tasaPago: list.length > 0 ? Math.round((pagadas / list.length) * 1000) / 10 : 0,
    };
  }

  return {
    rows: [
      summarize(cuotas.filter((c) => c.caso_legal_id !== null), "Con caso legal"),
      summarize(cuotas.filter((c) => c.caso_legal_id === null), "Regular"),
    ],
  };
}
