import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkMutationRole } from "@/server/auth/roles";
import { getTasaImpuesto, TIPO_RETENCION_HONORARIOS } from "@/lib/impuestos";
import { ContabilidadService } from "@/server/services/contabilidad/contabilidad.service";
import { EstadoComprobante, TipoMovimientoContable } from "@prisma/client";

const HonorarioSchema = z.object({
  proveedor_id: z.number().int().positive(),
  monto_bruto: z.number().positive(),
  tasa_retencion: z.number().min(0).max(1).optional(),
  fecha_emision: z.string().min(1),
  periodo_tributario: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const proveedor_id = sp.get("proveedor_id");
  const pagado = sp.get("pagado");

  const where: Record<string, unknown> = {};
  if (proveedor_id) where.proveedor_id = Number(proveedor_id);
  if (pagado !== null) where.pagado = pagado === "true";

  const honorarios = await prisma.honorarioRecibido.findMany({
    where,
    include: { proveedor: { select: { id: true, nombre: true, rut: true } } },
    orderBy: { fecha_emision: "desc" },
    take: 300,
  });
  return NextResponse.json(honorarios);
}

export async function POST(req: NextRequest) {
  const { session, error: authError } = await checkMutationRole();
  if (authError) return authError;

  const parsed = HonorarioSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", detalles: parsed.error.flatten() }, { status: 400 });

  const { proveedor_id, monto_bruto, tasa_retencion, fecha_emision, periodo_tributario } = parsed.data;

  const proveedor = await prisma.proveedor.findUnique({ where: { id: proveedor_id } });
  if (!proveedor) return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });

  const bruto = monto_bruto;
  const tasaConfig = await getTasaImpuesto(TIPO_RETENCION_HONORARIOS, prisma, null, 0.145);
  const tasa = tasa_retencion ?? tasaConfig;
  const retencion = Math.round(bruto * tasa);
  const neto = bruto - retencion;

  const fecha = new Date(fecha_emision);
  const svc = new ContabilidadService(prisma);
  let ctx: Awaited<ReturnType<typeof svc.resolverContexto>>;
  try {
    ctx = await svc.resolverContexto(["5102", "2102", "2101"], "COMPRA", fecha);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }

  const glosa = `Honorario ${proveedor.nombre}`;
  const partidas = [
    { cuenta_id: ctx.cuentas.get("5102")!.id, tipo: TipoMovimientoContable.DEBE,  monto: bruto,     glosa },
    { cuenta_id: ctx.cuentas.get("2102")!.id, tipo: TipoMovimientoContable.HABER, monto: retencion, glosa },
    { cuenta_id: ctx.cuentas.get("2101")!.id, tipo: TipoMovimientoContable.HABER, monto: neto,      glosa },
  ];

  const honorario = await prisma.$transaction(async (tx) => {
    const h = await tx.honorarioRecibido.create({
      data: {
        proveedor_id,
        monto_bruto: bruto,
        tasa_retencion: tasa,
        monto_retencion: retencion,
        monto_neto: neto,
        fecha_emision: fecha,
        periodo_tributario: periodo_tributario ?? null,
      },
    });

    await tx.cuentaPorPagar.create({
      data: {
        proveedor_id,
        monto: neto,
        fecha_vencimiento: fecha,
      },
    });

    await tx.comprobanteContable.create({
      data: {
        tipo_id: ctx.tipo.id,
        numero: ctx.tipo.siguiente_numero,
        fecha_comprobante: fecha,
        descripcion: `Honorario #${h.id} - ${proveedor.nombre}`,
        estado: EstadoComprobante.APROBADO,
        total_debe: bruto,
        total_haber: bruto,
        usuario_id: Number(session.userId),
        partidas: { create: partidas },
      },
    });
    await tx.tipoComprobanteContable.update({
      where: { id: ctx.tipo.id },
      data: { siguiente_numero: { increment: 1 } },
    });

    return h;
  });

  return NextResponse.json(honorario, { status: 201 });
}
