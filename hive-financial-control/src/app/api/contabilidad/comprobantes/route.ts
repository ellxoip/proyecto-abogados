import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkMutationRole } from "@/server/auth/roles";
import { TipoMovimientoContable } from "@prisma/client";
import { ContabilidadService } from "@/server/services/contabilidad/contabilidad.service";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tipo_id = sp.get("tipo_id");
  const estado = sp.get("estado");
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");

  const where: Record<string, unknown> = {};
  if (tipo_id) where.tipo_id = Number(tipo_id);
  if (estado) where.estado = estado;
  if (desde || hasta) {
    where.fecha_comprobante = {};
    if (desde) (where.fecha_comprobante as Record<string, unknown>).gte = new Date(desde);
    if (hasta) (where.fecha_comprobante as Record<string, unknown>).lte = new Date(hasta);
  }

  const comprobantes = await prisma.comprobanteContable.findMany({
    where,
    include: {
      tipo: { select: { nombre: true, prefijo: true } },
      partidas: { include: { cuenta: { select: { codigo: true, nombre: true } } } },
      usuario: { select: { nombre: true } },
    },
    orderBy: [{ fecha_comprobante: "desc" }, { numero: "desc" }],
    take: 200,
  });
  return NextResponse.json(comprobantes);
}

export async function POST(req: NextRequest) {
  const { session, error: authError } = await checkMutationRole();
  if (authError) return authError;

  const body = await req.json();
  const { tipo_id, fecha_comprobante, descripcion, partidas } = body;
  if (!tipo_id || !fecha_comprobante || !descripcion || !partidas?.length) {
    return NextResponse.json({ error: "Campos requeridos: tipo_id, fecha_comprobante, descripcion, partidas" }, { status: 400 });
  }

  const normalizedPartidas = (partidas as Array<{ cuenta_id: number; tipo: string; monto: number; glosa?: string }>).map((p) => ({
    ...p,
    tipo: p.tipo === "HABER" ? TipoMovimientoContable.HABER : TipoMovimientoContable.DEBE,
  }));

  const debe = normalizedPartidas.filter(p => p.tipo === TipoMovimientoContable.DEBE).reduce((s, p) => s + p.monto, 0);
  const haber = normalizedPartidas.filter(p => p.tipo === TipoMovimientoContable.HABER).reduce((s, p) => s + p.monto, 0);
  if (Math.abs(debe - haber) > 0.01) {
    return NextResponse.json({ error: `Comprobante no cuadra: debe=${debe} haber=${haber}` }, { status: 400 });
  }

  const svc = new ContabilidadService(prisma);
  try {
    await svc.validarPeriodoAbierto(new Date(fecha_comprobante));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }

  const tipo = await prisma.tipoComprobanteContable.findUnique({ where: { id: Number(tipo_id) } });
  if (!tipo) return NextResponse.json({ error: "Tipo de comprobante no encontrado" }, { status: 404 });

  const [comprobante] = await prisma.$transaction([
    prisma.comprobanteContable.create({
      data: {
        tipo_id: Number(tipo_id),
        numero: tipo.siguiente_numero,
        fecha_comprobante: new Date(fecha_comprobante),
        descripcion,
        total_debe: debe,
        total_haber: haber,
        usuario_id: Number(session.userId),
        partidas: {
          create: normalizedPartidas.map(p => ({
            tipo: p.tipo,
            monto: p.monto,
            glosa: p.glosa ?? null,
            cuenta: { connect: { id: Number(p.cuenta_id) } },
          })),
        },
      },
    }),
    prisma.tipoComprobanteContable.update({
      where: { id: Number(tipo_id) },
      data: { siguiente_numero: { increment: 1 } },
    }),
  ]);
  return NextResponse.json(comprobante, { status: 201 });
}
