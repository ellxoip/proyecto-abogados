import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkMutationRole } from "@/server/auth/roles";
import { ContabilidadService } from "@/server/services/contabilidad/contabilidad.service";
import { EstadoComprobante, EstadoDocVenta, TipoMovimientoContable } from "@prisma/client";

const NotaCreditoSchema = z.object({
  documento_origen_id: z.number().int().positive(),
  monto: z.number().positive(),
  motivo: z.string().min(1),
  fecha_emision: z.string().min(1),
});

export async function GET() {
  const notas = await prisma.notaCredito.findMany({
    include: { documento_origen: { select: { id: true, tipo: true, razon_social: true, monto_total: true } } },
    orderBy: { created_at: "desc" },
  });
  return NextResponse.json(notas);
}

export async function POST(req: NextRequest) {
  const { session, error: authError } = await checkMutationRole();
  if (authError) return authError;

  const parsed = NotaCreditoSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", detalles: parsed.error.flatten() }, { status: 400 });

  const { documento_origen_id, monto, motivo, fecha_emision } = parsed.data;

  const origen = await prisma.documentoVenta.findUnique({ where: { id: documento_origen_id } });
  if (!origen) return NextResponse.json({ error: "Documento origen no encontrado" }, { status: 404 });
  if (origen.estado === EstadoDocVenta.ANULADO) return NextResponse.json({ error: "No se puede aplicar nota a documento anulado" }, { status: 422 });
  if (monto > Number(origen.monto_total)) return NextResponse.json({ error: "Monto de nota supera el total del documento origen" }, { status: 422 });

  const fecha = new Date(fecha_emision);
  const esAfecto = Number(origen.iva) > 0;
  const pctNeto = Number(origen.monto_total) > 0 ? Number(origen.monto_neto) / Number(origen.monto_total) : 1;
  const montoNeto = esAfecto ? Math.round(monto * pctNeto) : monto;
  const montoIva = monto - montoNeto;

  const svc = new ContabilidadService(prisma);
  const codigos = esAfecto ? ["1201", "4101", "2103"] : ["1201", "4101"];
  let ctx: Awaited<ReturnType<typeof svc.resolverContexto>>;
  try {
    ctx = await svc.resolverContexto(codigos, "REVERSA", fecha);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }

  const c1201 = ctx.cuentas.get("1201")!;
  const c4101 = ctx.cuentas.get("4101")!;
  const tipoReversa = ctx.tipo;

  const partidas = esAfecto
    ? [
        { cuenta_id: c4101.id, tipo: TipoMovimientoContable.DEBE,  monto: montoNeto, glosa: motivo },
        { cuenta_id: ctx.cuentas.get("2103")!.id, tipo: TipoMovimientoContable.DEBE, monto: montoIva, glosa: motivo },
        { cuenta_id: c1201.id, tipo: TipoMovimientoContable.HABER, monto: monto, glosa: motivo },
      ]
    : [
        { cuenta_id: c4101.id, tipo: TipoMovimientoContable.DEBE,  monto: monto, glosa: motivo },
        { cuenta_id: c1201.id, tipo: TipoMovimientoContable.HABER, monto: monto, glosa: motivo },
      ];

  const anularOrigen = monto >= Number(origen.monto_total);

  const nota = await prisma.$transaction(async (tx) => {
    const n = await tx.notaCredito.create({
      data: { documento_origen_id, monto, motivo, fecha_emision: fecha },
    });

    if (anularOrigen) {
      await tx.documentoVenta.update({ where: { id: documento_origen_id }, data: { estado: EstadoDocVenta.ANULADO } });
    }

    await tx.comprobanteContable.create({
      data: {
        tipo_id: tipoReversa.id,
        numero: tipoReversa.siguiente_numero,
        fecha_comprobante: fecha,
        descripcion: `Nota crédito #${n.id} sobre documento #${documento_origen_id}`,
        estado: EstadoComprobante.APROBADO,
        total_debe: monto,
        total_haber: monto,
        usuario_id: Number(session.userId),
        partidas: { create: partidas },
      },
    });
    await tx.tipoComprobanteContable.update({
      where: { id: tipoReversa.id },
      data: { siguiente_numero: { increment: 1 } },
    });

    return n;
  });

  return NextResponse.json(nota, { status: 201 });
}
