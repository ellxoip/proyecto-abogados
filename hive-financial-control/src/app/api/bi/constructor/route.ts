import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Row = { name: string; value: number };

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const metrica = searchParams.get("metrica") ?? "pagos_monto";
  const agrupar = searchParams.get("agrupar") ?? "mes";

  try {
    const data = await resolve(metrica, agrupar);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

async function resolve(metrica: string, agrupar: string): Promise<Row[]> {
  switch (`${metrica}:${agrupar}`) {
    // ── pagos_monto ───────────────────────────────────────────────────────
    case "pagos_monto:mes":
      return prisma.$queryRaw<Row[]>`
        SELECT TO_CHAR(p.fecha_pago,'YYYY-MM') AS name, SUM(p.monto_pagado)::float8 AS value
        FROM "Pago" p WHERE p.estado NOT IN ('RECHAZADO','REVERSADO')
        GROUP BY 1 ORDER BY 1`;
    case "pagos_monto:cliente":
      return prisma.$queryRaw<Row[]>`
        SELECT c.nombre AS name, SUM(p.monto_pagado)::float8 AS value
        FROM "Pago" p JOIN "Cliente" c ON c.id=p.cliente_id
        WHERE p.estado NOT IN ('RECHAZADO','REVERSADO')
        GROUP BY c.nombre ORDER BY value DESC LIMIT 20`;
    case "pagos_monto:servicio":
      return prisma.$queryRaw<Row[]>`
        SELECT ct.tipo_servicio AS name, SUM(p.monto_pagado)::float8 AS value
        FROM "Pago" p JOIN "Contrato" ct ON ct.id=p.contrato_id
        WHERE p.estado NOT IN ('RECHAZADO','REVERSADO')
        GROUP BY ct.tipo_servicio ORDER BY value DESC`;
    case "pagos_monto:estado":
      return prisma.$queryRaw<Row[]>`
        SELECT p.estado::text AS name, SUM(p.monto_pagado)::float8 AS value
        FROM "Pago" p GROUP BY p.estado ORDER BY value DESC`;

    // ── cuotas_vencidas ───────────────────────────────────────────────────
    case "cuotas_vencidas:mes":
      return prisma.$queryRaw<Row[]>`
        SELECT TO_CHAR(c.fecha_vencimiento,'YYYY-MM') AS name, SUM(c.saldo_pendiente)::float8 AS value
        FROM "Cuota" c WHERE c.estado='VENCIDA' AND c.cobrable=true
        GROUP BY 1 ORDER BY 1`;
    case "cuotas_vencidas:cliente":
      return prisma.$queryRaw<Row[]>`
        SELECT cl.nombre AS name, SUM(c.saldo_pendiente)::float8 AS value
        FROM "Cuota" c
        JOIN "Contrato" ct ON ct.id=c.contrato_id
        JOIN "Cliente" cl ON cl.id=ct.cliente_id
        WHERE c.estado='VENCIDA' AND c.cobrable=true
        GROUP BY cl.nombre ORDER BY value DESC LIMIT 20`;
    case "cuotas_vencidas:servicio":
      return prisma.$queryRaw<Row[]>`
        SELECT ct.tipo_servicio AS name, SUM(c.saldo_pendiente)::float8 AS value
        FROM "Cuota" c JOIN "Contrato" ct ON ct.id=c.contrato_id
        WHERE c.estado='VENCIDA' AND c.cobrable=true
        GROUP BY ct.tipo_servicio ORDER BY value DESC`;
    case "cuotas_vencidas:estado":
      return prisma.$queryRaw<Row[]>`
        SELECT c.estado::text AS name, COUNT(*)::float8 AS value
        FROM "Cuota" c WHERE c.cobrable=true GROUP BY c.estado ORDER BY value DESC`;

    // ── contratos_activos ─────────────────────────────────────────────────
    case "contratos_activos:mes":
      return prisma.$queryRaw<Row[]>`
        SELECT TO_CHAR(c.fecha_contrato,'YYYY-MM') AS name, COUNT(*)::float8 AS value
        FROM "Contrato" c WHERE c.estado='ACTIVO' GROUP BY 1 ORDER BY 1`;
    case "contratos_activos:cliente":
      return prisma.$queryRaw<Row[]>`
        SELECT cl.nombre AS name, COUNT(*)::float8 AS value
        FROM "Contrato" c JOIN "Cliente" cl ON cl.id=c.cliente_id
        WHERE c.estado='ACTIVO' GROUP BY cl.nombre ORDER BY value DESC LIMIT 20`;
    case "contratos_activos:servicio":
      return prisma.$queryRaw<Row[]>`
        SELECT c.tipo_servicio AS name, COUNT(*)::float8 AS value
        FROM "Contrato" c WHERE c.estado='ACTIVO'
        GROUP BY c.tipo_servicio ORDER BY value DESC`;
    case "contratos_activos:estado":
      return prisma.$queryRaw<Row[]>`
        SELECT c.estado::text AS name, COUNT(*)::float8 AS value
        FROM "Contrato" c GROUP BY c.estado ORDER BY value DESC`;

    // ── gestiones_count ───────────────────────────────────────────────────
    case "gestiones_count:mes":
      return prisma.$queryRaw<Row[]>`
        SELECT TO_CHAR(g.fecha_gestion,'YYYY-MM') AS name, COUNT(*)::float8 AS value
        FROM "GestionCobranza" g GROUP BY 1 ORDER BY 1`;
    case "gestiones_count:cliente":
      return prisma.$queryRaw<Row[]>`
        SELECT c.nombre AS name, COUNT(*)::float8 AS value
        FROM "GestionCobranza" g JOIN "Cliente" c ON c.id=g.cliente_id
        GROUP BY c.nombre ORDER BY value DESC LIMIT 20`;
    case "gestiones_count:servicio":
      return prisma.$queryRaw<Row[]>`
        SELECT g.tipo::text AS name, COUNT(*)::float8 AS value
        FROM "GestionCobranza" g GROUP BY g.tipo ORDER BY value DESC`;
    case "gestiones_count:estado":
      return prisma.$queryRaw<Row[]>`
        SELECT g.resultado::text AS name, COUNT(*)::float8 AS value
        FROM "GestionCobranza" g GROUP BY g.resultado ORDER BY value DESC`;

    // ── documentos_venta ──────────────────────────────────────────────────
    case "documentos_venta:mes":
      return prisma.$queryRaw<Row[]>`
        SELECT TO_CHAR(d.fecha_emision,'YYYY-MM') AS name, SUM(d.monto_total)::float8 AS value
        FROM "DocumentoVenta" d WHERE d.estado!='ANULADO' GROUP BY 1 ORDER BY 1`;
    case "documentos_venta:cliente":
      return prisma.$queryRaw<Row[]>`
        SELECT d.razon_social AS name, SUM(d.monto_total)::float8 AS value
        FROM "DocumentoVenta" d WHERE d.estado!='ANULADO'
        GROUP BY d.razon_social ORDER BY value DESC LIMIT 20`;
    case "documentos_venta:servicio":
      return prisma.$queryRaw<Row[]>`
        SELECT COALESCE(s.nombre,'Sin servicio') AS name, SUM(d.monto_total)::float8 AS value
        FROM "DocumentoVenta" d LEFT JOIN "Servicio" s ON s.id=d.servicio_id
        WHERE d.estado!='ANULADO' GROUP BY s.nombre ORDER BY value DESC`;
    case "documentos_venta:estado":
      return prisma.$queryRaw<Row[]>`
        SELECT d.estado::text AS name, SUM(d.monto_total)::float8 AS value
        FROM "DocumentoVenta" d GROUP BY d.estado ORDER BY value DESC`;

    default:
      return [];
  }
}
