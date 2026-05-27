import { EstadoCuota, EstadoPago, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type EstadoCobranza =
  | "SIN_GESTION"
  | "CONTACTADO"
  | "COMPROMISO_ACTIVO"
  | "COMPROMISO_INCUMPLIDO"
  | "MOROSO"
  | "CRITICO";

type NumberLike = number | string | Prisma.Decimal;

type DeudorFilters = {
  q?: string;
  estadoCobranza?: EstadoCobranza | "";
  soloConCuotasVencidas?: boolean;
  minDeuda?: number;
  minDiasAtraso?: number;
  maxDiasAtraso?: number;
  minMonto?: number;
  maxMonto?: number;
  compromisoActivo?: boolean;
  compromisoIncumplido?: boolean;
};

type CobrosFilters = {
  q?: string;
  estadoCuota?: string;
  estadoCobranza?: EstadoCobranza | "";
  vencidas?: boolean;
  proximas?: boolean;
  compromisoActivo?: boolean;
  sinGestion?: boolean;
  minMonto?: number;
  maxMonto?: number;
  desde?: string;
  hasta?: string;
};

type HistorialFilters = {
  q?: string;
  tipoEvento?: string;
  entidad?: string;
  usuario?: string;
  origen?: string;
  desde?: string;
  hasta?: string;
  soloErrores?: boolean;
  soloPagos?: boolean;
  soloGestiones?: boolean;
  soloImportaciones?: boolean;
  page?: number;
  pageSize?: number;
};

export type DeudorRow = {
  clienteId: number;
  nombre: string;
  rut: string;
  email: string | null;
  telefono: string | null;
  totalDeuda: number;
  deudaVencida: number;
  deudaPorVencer: number;
  cuotasVencidas: number;
  diasAtrasoMaximo: number;
  ultimoPago: string | null;
  proximaCuota: string | null;
  ultimaGestion: string | null;
  estadoCobranza: EstadoCobranza;
  compromisoActivo: boolean;
  compromisoIncumplido: boolean;
};

export type CobroRow = {
  cuotaId: number;
  clienteId: number;
  contratoId: number;
  clienteNombre: string;
  clienteRut: string;
  contratoNombre: string;
  numeroCuota: number;
  monto: number;
  fechaVencimiento: string;
  diasAtraso: number;
  estadoCuota: string;
  estadoCobranza: EstadoCobranza;
  ultimaGestion: string | null;
  compromisoActivo: string | null;
  pagoPendienteRevision: boolean;
};

export type HistorialRow = {
  id: string;
  fecha: string;
  tipoEvento: string;
  entidad: string;
  entidadId: string | null;
  clienteId: number | null;
  clienteNombre: string | null;
  contratoId: number | null;
  contratoNombre: string | null;
  cuotaId: number | null;
  pagoId: number | null;
  usuario: string | null;
  origen: string;
  descripcion: string;
  estadoAnterior: string | null;
  estadoNuevo: string | null;
  monto: number | null;
  metadata: Record<string, unknown> | null;
};

export function paymentReducesDebt(estado: EstadoPago) {
  return estado === EstadoPago.CONFIRMADO;
}

export function splitDebtByDueDate(
  cuotas: Array<{ saldo_pendiente: NumberLike; fecha_vencimiento: Date }>,
  now = new Date(),
) {
  let deudaVencida = 0;
  let deudaPorVencer = 0;
  for (const cuota of cuotas) {
    const saldo = toNumber(cuota.saldo_pendiente);
    if (saldo <= 0) continue;
    if (cuota.fecha_vencimiento < now) deudaVencida += saldo;
    else deudaPorVencer += saldo;
  }
  return { deudaVencida, deudaPorVencer };
}

function toNumber(value: NumberLike): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return Number(value.toString());
}

function toIsoDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function daysDiff(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / 86400000);
}

export function inferEstadoCobranza(input: {
  diasAtrasoMaximo: number;
  cuotasVencidas: number;
  hasGestion: boolean;
  compromisoActivo: boolean;
  compromisoIncumplido: boolean;
}): EstadoCobranza {
  if (input.compromisoIncumplido) return "COMPROMISO_INCUMPLIDO";
  if (input.compromisoActivo) return "COMPROMISO_ACTIVO";
  if (input.diasAtrasoMaximo >= 90) return "CRITICO";
  if (input.cuotasVencidas > 0 || input.diasAtrasoMaximo > 0) return "MOROSO";
  if (input.hasGestion) return "CONTACTADO";
  return "SIN_GESTION";
}

export async function getDeudoresOverview(filters: DeudorFilters = {}, now = new Date()) {
  const clientes = await prisma.cliente.findMany({
    orderBy: { nombre: "asc" },
    select: {
      id: true,
      nombre: true,
      rut: true,
      email: true,
      telefono: true,
      contratos: {
        select: {
          id: true,
          estado: true,
          tipo_servicio: true,
          cuotas: {
            where: {
              estado: { in: [EstadoCuota.PENDIENTE, EstadoCuota.PARCIAL, EstadoCuota.VENCIDA, EstadoCuota.REPROGRAMADA] },
              cobrable: true,
            },
            select: {
              id: true,
              fecha_vencimiento: true,
              saldo_pendiente: true,
              estado: true,
              numero_cuota: true,
            },
          },
          pagos: {
            where: { estado: EstadoPago.CONFIRMADO },
            orderBy: { fecha_pago: "desc" },
            take: 1,
            select: { fecha_pago: true },
          },
          modificaciones: {
            orderBy: { created_at: "desc" },
            take: 1,
            select: {
              created_at: true,
              motivo: true,
              tipo_modificacion: true,
            },
          },
        },
      },
    },
  });

  const rows: DeudorRow[] = [];

  for (const cliente of clientes) {
    const cuotas = cliente.contratos.flatMap((contrato) => contrato.cuotas);
    const totalDeuda = cuotas.reduce((acc, cuota) => acc + toNumber(cuota.saldo_pendiente), 0);
    if (totalDeuda <= 0) continue;

    const cuotasVencidas = cuotas.filter(
      (cuota) => toNumber(cuota.saldo_pendiente) > 0 && cuota.fecha_vencimiento < now,
    );
    const cuotasPorVencer = cuotas.filter(
      (cuota) => toNumber(cuota.saldo_pendiente) > 0 && cuota.fecha_vencimiento >= now,
    );

    const { deudaVencida, deudaPorVencer } = splitDebtByDueDate(cuotas, now);
    const diasAtrasoMaximo = cuotasVencidas.length
      ? Math.max(...cuotasVencidas.map((cuota) => daysDiff(cuota.fecha_vencimiento, now)))
      : 0;

    const ultimoPagoDate = cliente.contratos
      .flatMap((c) => c.pagos.map((p) => p.fecha_pago))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    const proximaCuotaDate = cuotasPorVencer
      .sort((a, b) => a.fecha_vencimiento.getTime() - b.fecha_vencimiento.getTime())[0]?.fecha_vencimiento ?? null;

    const ultimaGestionItem = cliente.contratos
      .flatMap((c) => c.modificaciones)
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0];

    const repactados = cliente.contratos.filter((c) => c.estado === "REPACTADO");
    const compromisoActivo = repactados.some((contrato) =>
      contrato.cuotas.some((cuota) => toNumber(cuota.saldo_pendiente) > 0 && cuota.fecha_vencimiento >= now),
    );
    const compromisoIncumplido = repactados.some((contrato) =>
      contrato.cuotas.some((cuota) => toNumber(cuota.saldo_pendiente) > 0 && cuota.fecha_vencimiento < now),
    );

    const estadoCobranza = inferEstadoCobranza({
      diasAtrasoMaximo,
      cuotasVencidas: cuotasVencidas.length,
      hasGestion: Boolean(ultimaGestionItem),
      compromisoActivo,
      compromisoIncumplido,
    });

    rows.push({
      clienteId: cliente.id,
      nombre: cliente.nombre,
      rut: cliente.rut,
      email: cliente.email,
      telefono: cliente.telefono,
      totalDeuda,
      deudaVencida,
      deudaPorVencer,
      cuotasVencidas: cuotasVencidas.length,
      diasAtrasoMaximo,
      ultimoPago: toIsoDate(ultimoPagoDate),
      proximaCuota: toIsoDate(proximaCuotaDate),
      ultimaGestion: ultimaGestionItem
        ? `${toIsoDate(ultimaGestionItem.created_at)} - ${ultimaGestionItem.motivo.slice(0, 80)}`
        : null,
      estadoCobranza,
      compromisoActivo,
      compromisoIncumplido,
    });
  }

  const filtered = rows.filter((row) => {
    if (filters.q) {
      const q = filters.q.toLowerCase();
      const hay = [row.nombre, row.rut, row.email ?? ""].some((v) => v.toLowerCase().includes(q));
      if (!hay) return false;
    }
    if (filters.estadoCobranza && row.estadoCobranza !== filters.estadoCobranza) return false;
    if (filters.soloConCuotasVencidas && row.cuotasVencidas <= 0) return false;
    if (typeof filters.minDeuda === "number" && row.totalDeuda < filters.minDeuda) return false;
    if (typeof filters.minDiasAtraso === "number" && row.diasAtrasoMaximo < filters.minDiasAtraso) return false;
    if (typeof filters.maxDiasAtraso === "number" && row.diasAtrasoMaximo > filters.maxDiasAtraso) return false;
    if (typeof filters.minMonto === "number" && row.totalDeuda < filters.minMonto) return false;
    if (typeof filters.maxMonto === "number" && row.totalDeuda > filters.maxMonto) return false;
    if (filters.compromisoActivo && !row.compromisoActivo) return false;
    if (filters.compromisoIncumplido && !row.compromisoIncumplido) return false;
    return true;
  });

  return {
    data: filtered,
    summary: {
      totalDeudores: filtered.length,
      totalDeuda: filtered.reduce((acc, row) => acc + row.totalDeuda, 0),
      totalDeudaVencida: filtered.reduce((acc, row) => acc + row.deudaVencida, 0),
      clientesConCuotasVencidas: filtered.filter((row) => row.cuotasVencidas > 0).length,
      compromisosIncumplidos: filtered.filter((row) => row.compromisoIncumplido).length,
      clientesCriticos: filtered.filter((row) => row.estadoCobranza === "CRITICO").length,
    },
  };
}

export async function getCobrosOverview(filters: CobrosFilters = {}, now = new Date()) {
  const cuotas = await prisma.cuota.findMany({
    where: {
      estado: { in: [EstadoCuota.PENDIENTE, EstadoCuota.PARCIAL, EstadoCuota.VENCIDA, EstadoCuota.REPROGRAMADA] },
      cobrable: true,
    },
    orderBy: [{ fecha_vencimiento: "asc" }, { numero_cuota: "asc" }],
    select: {
      id: true,
      contrato_id: true,
      numero_cuota: true,
      fecha_vencimiento: true,
      saldo_pendiente: true,
      estado: true,
      contrato: {
        select: {
          tipo_servicio: true,
          estado: true,
          cliente: {
            select: {
              id: true,
              nombre: true,
              rut: true,
            },
          },
          modificaciones: {
            orderBy: { created_at: "desc" },
            take: 1,
            select: { created_at: true, motivo: true },
          },
        },
      },
      pagos: {
        where: { estado: { in: [EstadoPago.REGISTRADO, EstadoPago.RECHAZADO, EstadoPago.REVERSADO] } },
        select: { id: true },
      },
    },
  });

  const rows: CobroRow[] = cuotas.map((cuota) => {
    const diasAtraso = cuota.fecha_vencimiento < now ? daysDiff(cuota.fecha_vencimiento, now) : 0;
    const repactado = cuota.contrato.estado === "REPACTADO";
    const compromisoActivo =
      repactado && toNumber(cuota.saldo_pendiente) > 0 && cuota.fecha_vencimiento >= now
        ? toIsoDate(cuota.fecha_vencimiento)
        : null;

    const estadoCobranza = inferEstadoCobranza({
      diasAtrasoMaximo: diasAtraso,
      cuotasVencidas: diasAtraso > 0 ? 1 : 0,
      hasGestion: Boolean(cuota.contrato.modificaciones[0]),
      compromisoActivo: Boolean(compromisoActivo),
      compromisoIncumplido: repactado && diasAtraso > 0,
    });

    return {
      cuotaId: cuota.id,
      clienteId: cuota.contrato.cliente.id,
      contratoId: cuota.contrato_id,
      clienteNombre: cuota.contrato.cliente.nombre,
      clienteRut: cuota.contrato.cliente.rut,
      contratoNombre: cuota.contrato.tipo_servicio,
      numeroCuota: cuota.numero_cuota,
      monto: toNumber(cuota.saldo_pendiente),
      fechaVencimiento: cuota.fecha_vencimiento.toISOString().slice(0, 10),
      diasAtraso,
      estadoCuota: diasAtraso > 0 && cuota.estado !== EstadoCuota.PAGADA ? "VENCIDA" : cuota.estado,
      estadoCobranza,
      ultimaGestion: cuota.contrato.modificaciones[0]
        ? `${toIsoDate(cuota.contrato.modificaciones[0].created_at)} - ${cuota.contrato.modificaciones[0].motivo.slice(0, 80)}`
        : null,
      compromisoActivo,
      pagoPendienteRevision: cuota.pagos.length > 0,
    };
  });

  const soonDate = new Date(now);
  soonDate.setDate(soonDate.getDate() + 7);

  const filtered = rows.filter((row) => {
    if (filters.q) {
      const q = filters.q.toLowerCase();
      const hay = [row.clienteNombre, row.clienteRut, row.contratoNombre].some((v) => v.toLowerCase().includes(q));
      if (!hay) return false;
    }
    if (filters.estadoCuota && row.estadoCuota !== filters.estadoCuota) return false;
    if (filters.estadoCobranza && row.estadoCobranza !== filters.estadoCobranza) return false;
    if (filters.vencidas && row.diasAtraso <= 0) return false;
    if (filters.proximas) {
      const fv = new Date(row.fechaVencimiento);
      if (fv < now || fv > soonDate) return false;
    }
    if (filters.compromisoActivo && !row.compromisoActivo) return false;
    if (filters.sinGestion && row.ultimaGestion) return false;
    if (typeof filters.minMonto === "number" && row.monto < filters.minMonto) return false;
    if (typeof filters.maxMonto === "number" && row.monto > filters.maxMonto) return false;
    if (filters.desde && row.fechaVencimiento < filters.desde) return false;
    if (filters.hasta && row.fechaVencimiento > filters.hasta) return false;
    return true;
  });

  return {
    data: filtered,
    summary: {
      cobrosPendientes: filtered.length,
      cobrosVencidos: filtered.filter((row) => row.diasAtraso > 0).length,
      montoTotalPorCobrar: filtered.reduce((acc, row) => acc + row.monto, 0),
      montoVencido: filtered.filter((row) => row.diasAtraso > 0).reduce((acc, row) => acc + row.monto, 0),
      proximosAVencer: filtered.filter((row) => {
        const fv = new Date(row.fechaVencimiento);
        return fv >= now && fv <= soonDate;
      }).length,
      compromisosHoy: filtered.filter((row) => row.compromisoActivo === toIsoDate(now)).length,
      pagosPendientesRevision: filtered.filter((row) => row.pagoPendienteRevision).length,
    },
  };
}

function buildHistorialFromData(input: {
  clientes: Array<{ id: number; created_at: Date; updated_at: Date; nombre: string; rut: string }>;
  contratos: Array<{ id: number; created_at: Date; updated_at: Date; tipo_servicio: string; cliente_id: number; cliente: { nombre: string } }>;
  cuotas: Array<{ id: number; created_at: Date; updated_at: Date; estado: string; saldo_pendiente: NumberLike; contrato_id: number; contrato: { cliente_id: number; cliente: { nombre: string }; tipo_servicio: string } }>;
  pagos: Array<{ id: number; created_at: Date; updated_at: Date; fecha_pago: Date; monto_pagado: NumberLike; estado: EstadoPago; cliente_id: number; cuota_id: number | null; cliente: { nombre: string }; contrato: { tipo_servicio: string; id: number } }>;
  modificaciones: Array<{ id: number; created_at: Date; tipo_modificacion: string; motivo: string; contrato_id: number; cuota_id: number | null; usuario: { nombre: string }; contrato: { cliente_id: number; cliente: { nombre: string }; tipo_servicio: string } }>;
  integrationEvents: Array<{ id: number; created_at: Date; event_type: string; status: string; error_message: string | null; external_event_id: string | null; payload: Prisma.JsonValue }>;
  imports: Array<{ id: number; created_at: Date; filename: string; status: string; error_clients: number; created_by: number; creator: { nombre: string } }>;
}) {
  const events: HistorialRow[] = [];

  for (const cliente of input.clientes) {
    events.push({
      id: `cliente-created-${cliente.id}`,
      fecha: cliente.created_at.toISOString(),
      tipoEvento: "CLIENTE_CREADO",
      entidad: "CLIENTE",
      entidadId: String(cliente.id),
      clienteId: cliente.id,
      clienteNombre: cliente.nombre,
      contratoId: null,
      contratoNombre: null,
      cuotaId: null,
      pagoId: null,
      usuario: null,
      origen: "MANUAL",
      descripcion: `Cliente creado: ${cliente.nombre} (${cliente.rut})`,
      estadoAnterior: null,
      estadoNuevo: null,
      monto: null,
      metadata: null,
    });
    if (cliente.updated_at.getTime() !== cliente.created_at.getTime()) {
      events.push({
        id: `cliente-edited-${cliente.id}`,
        fecha: cliente.updated_at.toISOString(),
        tipoEvento: "CLIENTE_EDITADO",
        entidad: "CLIENTE",
        entidadId: String(cliente.id),
        clienteId: cliente.id,
        clienteNombre: cliente.nombre,
        contratoId: null,
        contratoNombre: null,
        cuotaId: null,
        pagoId: null,
        usuario: null,
        origen: "MANUAL",
        descripcion: `Cliente actualizado: ${cliente.nombre}`,
        estadoAnterior: null,
        estadoNuevo: null,
        monto: null,
        metadata: null,
      });
    }
  }

  for (const pago of input.pagos) {
    events.push({
      id: `pago-${pago.id}`,
      fecha: pago.created_at.toISOString(),
      tipoEvento: `PAGO_${pago.estado}`,
      entidad: "PAGO",
      entidadId: String(pago.id),
      clienteId: pago.cliente_id,
      clienteNombre: pago.cliente.nombre,
      contratoId: pago.contrato.id,
      contratoNombre: pago.contrato.tipo_servicio,
      cuotaId: pago.cuota_id,
      pagoId: pago.id,
      usuario: null,
      origen: "MANUAL",
      descripcion: `Pago ${pago.estado.toLowerCase()} por ${toNumber(pago.monto_pagado)}`,
      estadoAnterior: null,
      estadoNuevo: pago.estado,
      monto: toNumber(pago.monto_pagado),
      metadata: null,
    });
  }

  for (const mod of input.modificaciones) {
    events.push({
      id: `mod-${mod.id}`,
      fecha: mod.created_at.toISOString(),
      tipoEvento: mod.tipo_modificacion === "REPACTACION" ? "COMPROMISO_PAGO_CREADO" : "GESTION_COBRANZA_REGISTRADA",
      entidad: mod.cuota_id ? "CUOTA" : "CONTRATO",
      entidadId: String(mod.cuota_id ?? mod.contrato_id),
      clienteId: mod.contrato.cliente_id,
      clienteNombre: mod.contrato.cliente.nombre,
      contratoId: mod.contrato_id,
      contratoNombre: mod.contrato.tipo_servicio,
      cuotaId: mod.cuota_id,
      pagoId: null,
      usuario: mod.usuario.nombre,
      origen: "MANUAL",
      descripcion: mod.motivo,
      estadoAnterior: null,
      estadoNuevo: mod.tipo_modificacion,
      monto: null,
      metadata: null,
    });
  }

  for (const event of input.integrationEvents) {
    events.push({
      id: `integration-${event.id}`,
      fecha: event.created_at.toISOString(),
      tipoEvento: "INTEGRACION_PAGACUOTAS_RECIBIDA",
      entidad: "INTEGRACION",
      entidadId: String(event.id),
      clienteId: null,
      clienteNombre: null,
      contratoId: null,
      contratoNombre: null,
      cuotaId: null,
      pagoId: null,
      usuario: null,
      origen: "PAGACUOTAS",
      descripcion: `${event.event_type} (${event.status})`,
      estadoAnterior: null,
      estadoNuevo: event.status,
      monto: null,
      metadata: typeof event.payload === "object" && event.payload ? (event.payload as Record<string, unknown>) : null,
    });
  }

  for (const imp of input.imports) {
    events.push({
      id: `import-${imp.id}`,
      fecha: imp.created_at.toISOString(),
      tipoEvento: "IMPORTACION_EJECUTADA",
      entidad: "IMPORTACION",
      entidadId: String(imp.id),
      clienteId: null,
      clienteNombre: null,
      contratoId: null,
      contratoNombre: null,
      cuotaId: null,
      pagoId: null,
      usuario: imp.creator.nombre,
      origen: "IMPORTACION",
      descripcion: `Archivo ${imp.filename} (${imp.status})`,
      estadoAnterior: null,
      estadoNuevo: imp.status,
      monto: null,
      metadata: { errorClients: imp.error_clients },
    });

    if (imp.error_clients > 0) {
      events.push({
        id: `import-error-${imp.id}`,
        fecha: imp.created_at.toISOString(),
        tipoEvento: "ERROR_IMPORTACION",
        entidad: "IMPORTACION",
        entidadId: String(imp.id),
        clienteId: null,
        clienteNombre: null,
        contratoId: null,
        contratoNombre: null,
        cuotaId: null,
        pagoId: null,
        usuario: imp.creator.nombre,
        origen: "IMPORTACION",
        descripcion: `Importacion con ${imp.error_clients} errores para revision`,
        estadoAnterior: null,
        estadoNuevo: "ERROR",
        monto: null,
        metadata: { errorClients: imp.error_clients },
      });
    }
  }

  return events;
}

export async function getCobrosHistorial(filters: HistorialFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filters.pageSize ?? 20));

  const [clientes, contratos, cuotas, pagos, modificaciones, integrationEvents, imports] = await Promise.all([
    prisma.cliente.findMany({ select: { id: true, created_at: true, updated_at: true, nombre: true, rut: true } }),
    prisma.contrato.findMany({ select: { id: true, created_at: true, updated_at: true, tipo_servicio: true, cliente_id: true, cliente: { select: { nombre: true } } } }),
    prisma.cuota.findMany({ select: { id: true, created_at: true, updated_at: true, estado: true, saldo_pendiente: true, contrato_id: true, contrato: { select: { tipo_servicio: true, cliente_id: true, cliente: { select: { nombre: true } } } } } }),
    prisma.pago.findMany({ select: { id: true, created_at: true, updated_at: true, fecha_pago: true, monto_pagado: true, estado: true, cliente_id: true, cuota_id: true, cliente: { select: { nombre: true } }, contrato: { select: { id: true, tipo_servicio: true } } } }),
    prisma.modificacionContrato.findMany({ select: { id: true, created_at: true, tipo_modificacion: true, motivo: true, contrato_id: true, cuota_id: true, usuario: { select: { nombre: true } }, contrato: { select: { tipo_servicio: true, cliente_id: true, cliente: { select: { nombre: true } } } } } }),
    prisma.integrationEvent.findMany({ select: { id: true, created_at: true, event_type: true, status: true, error_message: true, external_event_id: true, payload: true } }),
    prisma.clientImportBatch.findMany({ select: { id: true, created_at: true, filename: true, status: true, error_clients: true, created_by: true, creator: { select: { nombre: true } } } }),
  ]);

  const cuotaEvents: HistorialRow[] = cuotas.flatMap((cuota) => {
    const created: HistorialRow = {
      id: `cuota-created-${cuota.id}`,
      fecha: cuota.created_at.toISOString(),
      tipoEvento: "CUOTA_CREADA",
      entidad: "CUOTA",
      entidadId: String(cuota.id),
      clienteId: cuota.contrato.cliente_id,
      clienteNombre: cuota.contrato.cliente.nombre,
      contratoId: cuota.contrato_id,
      contratoNombre: cuota.contrato.tipo_servicio,
      cuotaId: cuota.id,
      pagoId: null,
      usuario: null,
      origen: "SISTEMA",
      descripcion: "Cuota creada",
      estadoAnterior: null,
      estadoNuevo: cuota.estado,
      monto: toNumber(cuota.saldo_pendiente),
      metadata: null,
    };
    if (cuota.updated_at.getTime() === cuota.created_at.getTime()) return [created];
    const edited: HistorialRow = {
      ...created,
      id: `cuota-edited-${cuota.id}`,
      fecha: cuota.updated_at.toISOString(),
      tipoEvento: "CUOTA_EDITADA",
      descripcion: "Cuota actualizada",
    };
    return [created, edited];
  });

  const contratoEvents: HistorialRow[] = contratos.flatMap((contrato) => {
    const created: HistorialRow = {
      id: `contrato-created-${contrato.id}`,
      fecha: contrato.created_at.toISOString(),
      tipoEvento: "CONTRATO_CREADO",
      entidad: "CONTRATO",
      entidadId: String(contrato.id),
      clienteId: contrato.cliente_id,
      clienteNombre: contrato.cliente.nombre,
      contratoId: contrato.id,
      contratoNombre: contrato.tipo_servicio,
      cuotaId: null,
      pagoId: null,
      usuario: null,
      origen: "MANUAL",
      descripcion: `Contrato creado: ${contrato.tipo_servicio}`,
      estadoAnterior: null,
      estadoNuevo: null,
      monto: null,
      metadata: null,
    };
    if (contrato.updated_at.getTime() === contrato.created_at.getTime()) return [created];
    return [created, { ...created, id: `contrato-edited-${contrato.id}`, fecha: contrato.updated_at.toISOString(), tipoEvento: "CONTRATO_EDITADO", descripcion: "Contrato actualizado" }];
  });

  const allEvents = [
    ...buildHistorialFromData({ clientes, contratos, cuotas, pagos, modificaciones, integrationEvents, imports }),
    ...cuotaEvents,
    ...contratoEvents,
  ];

  const filtered = allEvents
    .filter((row) => {
      if (filters.q) {
        const q = filters.q.toLowerCase();
        const hay = [
          row.clienteNombre ?? "",
          row.contratoNombre ?? "",
          row.descripcion,
          row.entidadId ?? "",
        ].some((v) => v.toLowerCase().includes(q));
        if (!hay) return false;
      }
      if (filters.tipoEvento && row.tipoEvento !== filters.tipoEvento) return false;
      if (filters.entidad && row.entidad !== filters.entidad) return false;
      if (filters.usuario && (row.usuario ?? "") !== filters.usuario) return false;
      if (filters.origen && row.origen !== filters.origen) return false;
      if (filters.desde && row.fecha.slice(0, 10) < filters.desde) return false;
      if (filters.hasta && row.fecha.slice(0, 10) > filters.hasta) return false;
      if (filters.soloErrores && !row.tipoEvento.includes("ERROR")) return false;
      if (filters.soloPagos && !row.tipoEvento.includes("PAGO")) return false;
      if (filters.soloGestiones && !(row.tipoEvento.includes("GESTION") || row.tipoEvento.includes("COMPROMISO"))) return false;
      if (filters.soloImportaciones && !row.tipoEvento.includes("IMPORTACION")) return false;
      return true;
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  const start = (page - 1) * pageSize;

  return {
    data: filtered.slice(start, start + pageSize),
    pagination: {
      page,
      pageSize,
      total: filtered.length,
    },
  };
}

export function getDeudorEstadoClass(estado: EstadoCobranza) {
  switch (estado) {
    case "CRITICO":
      return "bg-red-200 text-red-800";
    case "MOROSO":
      return "bg-rose-100 text-rose-700";
    case "COMPROMISO_INCUMPLIDO":
      return "bg-orange-200 text-orange-800";
    case "COMPROMISO_ACTIVO":
      return "bg-sky-100 text-sky-700";
    case "CONTACTADO":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-slate-200 text-slate-700";
  }
}
