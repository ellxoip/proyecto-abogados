import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkMutationRole } from "@/server/auth/roles";
import { getTasaImpuesto, TIPO_IVA } from "@/lib/impuestos";
import { ContabilidadService } from "@/server/services/contabilidad/contabilidad.service";
import { EstadoComprobante, TipoDocumentoVenta, TipoMovimientoContable } from "@prisma/client";

const LineaSchema = z.object({
  descripcion: z.string().min(1),
  cantidad: z.number().positive(),
  precio_unitario: z.number().nonnegative(),
  descuento: z.number().min(0).max(100).optional().default(0),
});

const DocumentoVentaSchema = z.object({
  tipo: z.string().min(1),
  cliente_id: z.number().int().positive().optional(),
  razon_social: z.string().min(1),
  rut_receptor: z.string().optional(),
  fecha_emision: z.string().min(1),
  fecha_vencimiento: z.string().optional(),
  afecto_iva: z.boolean().optional().default(true),
  lineas: z.array(LineaSchema).min(1),
  observaciones: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tipo = sp.get("tipo");
  const estado = sp.get("estado");
  const cliente_id = sp.get("cliente_id");
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");

  const where: Record<string, unknown> = {};
  if (tipo) where.tipo = tipo;
  if (estado) where.estado = estado;
  if (cliente_id) where.cliente_id = Number(cliente_id);
  if (desde || hasta) {
    where.fecha_emision = {};
    if (desde) (where.fecha_emision as Record<string, unknown>).gte = new Date(desde);
    if (hasta) (where.fecha_emision as Record<string, unknown>).lte = new Date(hasta);
  }

  const documentos = await prisma.documentoVenta.findMany({
    where,
    include: { cliente: { select: { id: true, nombre: true, rut: true } }, lineas: true, notas_credito: true },
    orderBy: { fecha_emision: "desc" },
    take: 500,
  });
  return NextResponse.json(documentos);
}

export async function POST(req: NextRequest) {
  const { session, error: authError } = await checkMutationRole();
  if (authError) return authError;

  const parsed = DocumentoVentaSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", detalles: parsed.error.flatten() }, { status: 400 });

  const { tipo, cliente_id, razon_social, rut_receptor, fecha_emision, fecha_vencimiento, afecto_iva, lineas, observaciones } = parsed.data;

  const fecha = new Date(fecha_emision);
  const esAfecto = afecto_iva !== false && tipo !== "FACTURA_EXENTA";

  const lineasData = lineas.map((l) => {
    const subtotal = l.cantidad * l.precio_unitario * (1 - l.descuento / 100);
    return { descripcion: l.descripcion, cantidad: l.cantidad, precio_unitario: l.precio_unitario, descuento: l.descuento, subtotal };
  });
  const monto_neto = lineasData.reduce((s, l) => s + l.subtotal, 0);
  const tasaIVA = await getTasaImpuesto(TIPO_IVA, prisma, null, 0.19);
  const iva = esAfecto ? Math.round(monto_neto * tasaIVA) : 0;
  const monto_total = monto_neto + iva;
  if (monto_total <= 0) return NextResponse.json({ error: "monto_total debe ser mayor a 0" }, { status: 400 });

  const svc = new ContabilidadService(prisma);
  const codigos = esAfecto ? ["1201", "4101", "2103"] : ["1201", "4101"];
  let ctx: Awaited<ReturnType<typeof svc.resolverContexto>>;
  try {
    ctx = await svc.resolverContexto(codigos, "VENTA", fecha);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }

  const c1201 = ctx.cuentas.get("1201")!;
  const c4101 = ctx.cuentas.get("4101")!;
  const tipoVenta = ctx.tipo;
  const glosa = `Venta ${tipo} - ${razon_social}`;

  const partidas = esAfecto
    ? [
        { cuenta_id: c1201.id, tipo: TipoMovimientoContable.DEBE,  monto: monto_total, glosa },
        { cuenta_id: c4101.id, tipo: TipoMovimientoContable.HABER, monto: monto_neto,  glosa },
        { cuenta_id: ctx.cuentas.get("2103")!.id, tipo: TipoMovimientoContable.HABER, monto: iva, glosa },
      ]
    : [
        { cuenta_id: c1201.id, tipo: TipoMovimientoContable.DEBE,  monto: monto_total, glosa },
        { cuenta_id: c4101.id, tipo: TipoMovimientoContable.HABER, monto: monto_total, glosa },
      ];

  const documento = await prisma.$transaction(async (tx) => {
    const doc = await tx.documentoVenta.create({
      data: {
        tipo: tipo as TipoDocumentoVenta,
        cliente_id: cliente_id ?? null,
        razon_social,
        rut_receptor: rut_receptor ?? null,
        fecha_emision: fecha,
        fecha_vencimiento: fecha_vencimiento ? new Date(fecha_vencimiento) : null,
        monto_neto,
        iva,
        monto_total,
        observaciones: observaciones ?? null,
        lineas: { create: lineasData },
      },
      include: { cliente: { select: { id: true, nombre: true } }, lineas: true },
    });

    await tx.comprobanteContable.create({
      data: {
        tipo_id: tipoVenta.id,
        numero: tipoVenta.siguiente_numero,
        fecha_comprobante: fecha,
        descripcion: `Venta ${tipo} #${doc.id} - ${razon_social}`,
        estado: EstadoComprobante.APROBADO,
        total_debe: monto_total,
        total_haber: monto_total,
        usuario_id: Number(session.userId),
        partidas: { create: partidas },
      },
    });
    await tx.tipoComprobanteContable.update({
      where: { id: tipoVenta.id },
      data: { siguiente_numero: { increment: 1 } },
    });

    return doc;
  });

  return NextResponse.json(documento, { status: 201 });
}
