import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkMutationRole } from "@/server/auth/roles";
import { getTasaImpuesto, TIPO_IVA } from "@/lib/impuestos";
import { ContabilidadService } from "@/server/services/contabilidad/contabilidad.service";
import { EstadoComprobante, TipoDocumentoCompra, TipoMovimientoContable } from "@prisma/client";

const LineaCompraSchema = z.object({
  descripcion: z.string().min(1),
  cantidad: z.number().positive().optional().default(1),
  precio_unitario: z.number().nonnegative(),
  subtotal: z.number().nonnegative(),
});

const DocumentoCompraSchema = z.object({
  proveedor_id: z.number().int().positive(),
  tipo: z.string().min(1),
  numero: z.string().optional(),
  fecha_emision: z.string().min(1),
  fecha_vencimiento: z.string().optional(),
  monto_neto: z.number().nonnegative(),
  con_iva: z.boolean().optional().default(true),
  lineas: z.array(LineaCompraSchema).optional(),
});

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const proveedor_id = sp.get("proveedor_id");
  const estado = sp.get("estado");
  const tipo = sp.get("tipo");

  const where: Record<string, unknown> = {};
  if (proveedor_id) where.proveedor_id = Number(proveedor_id);
  if (estado) where.estado = estado;
  if (tipo) where.tipo = tipo;

  const documentos = await prisma.documentoCompra.findMany({
    where,
    include: { proveedor: { select: { id: true, nombre: true, rut: true } }, lineas: true },
    orderBy: { fecha_emision: "desc" },
    take: 500,
  });
  return NextResponse.json(documentos);
}

export async function POST(req: NextRequest) {
  const { session, error: authError } = await checkMutationRole();
  if (authError) return authError;

  const parsed = DocumentoCompraSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", detalles: parsed.error.flatten() }, { status: 400 });

  const { proveedor_id, tipo, numero, fecha_emision, fecha_vencimiento, monto_neto, con_iva, lineas } = parsed.data;

  const proveedor = await prisma.proveedor.findUnique({ where: { id: proveedor_id } });
  if (!proveedor) return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });

  const neto = monto_neto;
  const esAfecto = con_iva !== false;
  const tasaIVA = await getTasaImpuesto(TIPO_IVA, prisma, null, 0.19);
  const iva = esAfecto ? Math.round(neto * tasaIVA) : 0;
  const total = neto + iva;
  if (total <= 0) return NextResponse.json({ error: "monto_total debe ser mayor a 0" }, { status: 400 });

  const fecha = new Date(fecha_emision);
  const svc = new ContabilidadService(prisma);
  const codigos = esAfecto ? ["5101", "1104", "2101"] : ["5101", "2101"];
  let ctx: Awaited<ReturnType<typeof svc.resolverContexto>>;
  try {
    ctx = await svc.resolverContexto(codigos, "COMPRA", fecha);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }

  const c5101 = ctx.cuentas.get("5101")!;
  const c2101 = ctx.cuentas.get("2101")!;
  const tipoCompra = ctx.tipo;
  const glosa = `Compra ${tipo} - ${proveedor.nombre}`;

  const partidas = esAfecto
    ? [
        { cuenta_id: c5101.id, tipo: TipoMovimientoContable.DEBE,  monto: neto,  glosa },
        { cuenta_id: ctx.cuentas.get("1104")!.id, tipo: TipoMovimientoContable.DEBE, monto: iva, glosa },
        { cuenta_id: c2101.id, tipo: TipoMovimientoContable.HABER, monto: total, glosa },
      ]
    : [
        { cuenta_id: c5101.id, tipo: TipoMovimientoContable.DEBE,  monto: total, glosa },
        { cuenta_id: c2101.id, tipo: TipoMovimientoContable.HABER, monto: total, glosa },
      ];

  const resultado = await prisma.$transaction(async (tx) => {
    const doc = await tx.documentoCompra.create({
      data: {
        proveedor_id,
        tipo: tipo as TipoDocumentoCompra,
        numero: numero ?? null,
        fecha_emision: fecha,
        fecha_vencimiento: fecha_vencimiento ? new Date(fecha_vencimiento) : null,
        monto_neto: neto,
        iva,
        monto_total: total,
        lineas: lineas?.length ? { create: lineas } : undefined,
      },
      include: { proveedor: { select: { id: true, nombre: true } }, lineas: true },
    });

    // CxP solo si no existe ya para este documento
    const cxpExistente = await tx.cuentaPorPagar.findFirst({ where: { documento_id: doc.id } });
    if (!cxpExistente) {
      await tx.cuentaPorPagar.create({
        data: {
          proveedor_id,
          monto: total,
          fecha_vencimiento: fecha_vencimiento ? new Date(fecha_vencimiento) : fecha,
          documento_id: doc.id,
        },
      });
    }

    await tx.comprobanteContable.create({
      data: {
        tipo_id: tipoCompra.id,
        numero: tipoCompra.siguiente_numero,
        fecha_comprobante: fecha,
        descripcion: `Compra ${tipo} #${doc.id} - ${proveedor.nombre}`,
        estado: EstadoComprobante.APROBADO,
        total_debe: total,
        total_haber: total,
        usuario_id: Number(session.userId),
        partidas: { create: partidas },
      },
    });
    await tx.tipoComprobanteContable.update({
      where: { id: tipoCompra.id },
      data: { siguiente_numero: { increment: 1 } },
    });

    return doc;
  });

  return NextResponse.json(resultado, { status: 201 });
}
