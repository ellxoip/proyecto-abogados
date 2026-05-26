import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkMutationRole } from "@/server/auth/roles";
import { EstadoCxP, EstadoPago, IntegrationEventStatus } from "@prisma/client";

interface IntegrityIssue {
  severity: "ERROR" | "WARNING";
  entity: string;
  entity_id: string;
  code: string;
  message: string;
  recommended_action: string;
}

export async function GET(req: NextRequest) {
  const { error } = await checkMutationRole();
  if (error) return error;

  const url = new URL(req.url);
  const fechaDesde = url.searchParams.get("fecha_desde")
    ? new Date(url.searchParams.get("fecha_desde")!)
    : undefined;
  const fechaHasta = url.searchParams.get("fecha_hasta")
    ? new Date(url.searchParams.get("fecha_hasta")!)
    : undefined;

  const dateFilter = fechaDesde || fechaHasta
    ? { ...(fechaDesde ? { gte: fechaDesde } : {}), ...(fechaHasta ? { lte: fechaHasta } : {}) }
    : undefined;

  const issues: IntegrityIssue[] = [];

  // --- Pagos ---
  const movimientoPagoIds = new Set(
    (await prisma.movimientoTesoreria.findMany({ where: { pago_id: { not: null } }, select: { pago_id: true } }))
      .map(m => m.pago_id)
      .filter((id): id is number => id != null),
  );

  const pagosConfirmados = await prisma.pago.findMany({
    where: {
      estado: EstadoPago.CONFIRMADO,
      ...(dateFilter ? { fecha_pago: dateFilter } : {}),
    },
    select: { id: true, fecha_pago: true, monto_pagado: true },
  });

  for (const p of pagosConfirmados) {
    if (!movimientoPagoIds.has(p.id)) {
      issues.push({
        severity: "ERROR",
        entity: "Pago",
        entity_id: String(p.id),
        code: "CONFIRMED_PAYMENT_WITHOUT_TREASURY",
        message: `Pago #${p.id} confirmado sin MovimientoTesoreria`,
        recommended_action: "POST /api/contabilidad/pendientes-contabilizacion/${p.id}/reintentar",
      });
    }
  }

  const pagosReversados = await prisma.pago.findMany({
    where: {
      estado: EstadoPago.REVERSADO,
      monto_pagado: { lt: 0 },
      ...(dateFilter ? { fecha_pago: dateFilter } : {}),
    },
    select: { id: true },
  });

  const reversaMovIds = new Set(
    (await prisma.movimientoTesoreria.findMany({
      where: { pago_id: { in: pagosReversados.map(p => p.id) } },
      select: { pago_id: true },
    })).map(m => m.pago_id).filter((id): id is number => id != null),
  );

  for (const p of pagosReversados) {
    if (!reversaMovIds.has(p.id)) {
      issues.push({
        severity: "ERROR",
        entity: "Pago",
        entity_id: String(p.id),
        code: "REVERSED_PAYMENT_WITHOUT_ACCOUNTING",
        message: `Reversa #${p.id} sin asiento contable`,
        recommended_action: "Crear ajuste manual o reintentar vía webhook",
      });
    }
  }

  // --- CxP ---
  const cxpPagadas = await prisma.cuentaPorPagar.findMany({
    where: {
      estado: EstadoCxP.PAGADA,
      ...(dateFilter ? { fecha_pago: dateFilter } : {}),
    },
    select: { id: true },
  });

  const egresoCxpIds = new Set(
    (await prisma.egresoTesoreria.findMany({
      where: { descripcion: { contains: "CxP" } },
      select: { id: true },
    })).map(e => e.id),
  );

  if (cxpPagadas.length > 0 && egresoCxpIds.size === 0) {
    issues.push({
      severity: "WARNING",
      entity: "CuentaPorPagar",
      entity_id: "multiple",
      code: "CXP_PAGADA_WITHOUT_EGRESO",
      message: `${cxpPagadas.length} CxP pagadas — verificar que tengan EgresoTesoreria asociado`,
      recommended_action: "Revisar endpoint /api/compras/cuentas-por-pagar",
    });
  }

  // --- Comprobantes contables ---
  const comprobantesDesbalanceados = await prisma.comprobanteContable.findMany({
    where: {
      ...(dateFilter ? { fecha_comprobante: dateFilter } : {}),
    },
    select: { id: true, total_debe: true, total_haber: true, estado: true },
  });

  for (const c of comprobantesDesbalanceados) {
    const debe = Number(c.total_debe);
    const haber = Number(c.total_haber);
    if (Math.abs(debe - haber) > 0.01) {
      issues.push({
        severity: "ERROR",
        entity: "ComprobanteContable",
        entity_id: String(c.id),
        code: "UNBALANCED_COMPROBANTE",
        message: `Comprobante #${c.id} desbalanceado (Debe: ${debe}, Haber: ${haber})`,
        recommended_action: "Anular y recrear el comprobante",
      });
    }
  }

  const comprobantesAprobadosSinPartidas = await prisma.comprobanteContable.findMany({
    where: {
      estado: "APROBADO",
      partidas: { none: {} },
      ...(dateFilter ? { fecha_comprobante: dateFilter } : {}),
    },
    select: { id: true },
  });

  for (const c of comprobantesAprobadosSinPartidas) {
    issues.push({
      severity: "ERROR",
      entity: "ComprobanteContable",
      entity_id: String(c.id),
      code: "APPROVED_COMPROBANTE_WITHOUT_PARTIDAS",
      message: `Comprobante #${c.id} aprobado sin partidas contables`,
      recommended_action: "Revisar manualmente y anular si corresponde",
    });
  }

  // --- Fondos caja chica ---
  const fondosNegativos = await prisma.fondoCajaChica.findMany({
    where: { saldo_actual: { lt: 0 } },
    select: { id: true, nombre: true, saldo_actual: true },
  });
  for (const f of fondosNegativos) {
    issues.push({
      severity: "ERROR",
      entity: "FondoCajaChica",
      entity_id: String(f.id),
      code: "NEGATIVE_CAJA_CHICA_BALANCE",
      message: `Fondo "${f.nombre}" tiene saldo negativo: ${Number(f.saldo_actual)}`,
      recommended_action: "Registrar reposición o corregir saldo",
    });
  }

  // --- Eventos de contabilización fallida ---
  const eventosFallidos = await prisma.integrationEvent.count({
    where: {
      event_type: "accounting.posting.failed",
      status: { in: [IntegrationEventStatus.PENDING, IntegrationEventStatus.FAILED] },
    },
  });
  if (eventosFallidos > 0) {
    issues.push({
      severity: "WARNING",
      entity: "IntegrationEvent",
      entity_id: "multiple",
      code: "PENDING_ACCOUNTING_FAILURES",
      message: `${eventosFallidos} evento(s) de contabilización fallida sin resolver`,
      recommended_action: "Revisar GET /api/contabilidad/pendientes-contabilizacion y reintentar",
    });
  }

  const errors = issues.filter(i => i.severity === "ERROR").length;
  const warnings = issues.filter(i => i.severity === "WARNING").length;

  return NextResponse.json({
    status: errors > 0 ? "ERROR" : warnings > 0 ? "WARNING" : "OK",
    issues,
    summary: { errors, warnings },
  });
}
