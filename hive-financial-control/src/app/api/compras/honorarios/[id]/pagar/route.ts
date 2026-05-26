import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkMutationRole } from "@/server/auth/roles";
import { ContabilidadService } from "@/server/services/contabilidad/contabilidad.service";
import { EstadoComprobante, TipoMovimientoContable, TipoMovimientoTesoreria } from "@prisma/client";

const PagarHonorarioSchema = z.object({
  cuenta_bancaria_id: z.number().int().positive(),
  fecha_pago: z.string().min(1),
  referencia: z.string().optional(),
  observacion: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error: authError } = await checkMutationRole();
  if (authError) return authError;

  const { id } = await params;
  const parsed = PagarHonorarioSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", detalles: parsed.error.flatten() }, { status: 400 });

  const { cuenta_bancaria_id, fecha_pago, referencia, observacion } = parsed.data;

  const honorario = await prisma.honorarioRecibido.findUnique({
    where: { id: Number(id) },
    include: { proveedor: { select: { nombre: true } } },
  });
  if (!honorario) return NextResponse.json({ error: "Honorario no encontrado" }, { status: 404 });
  if (honorario.pagado) return NextResponse.json({ error: "Honorario ya está pagado" }, { status: 422 });

  const cuentaBancaria = await prisma.cuentaBancaria.findUnique({ where: { id: cuenta_bancaria_id } });
  if (!cuentaBancaria || !cuentaBancaria.activa) return NextResponse.json({ error: "Cuenta bancaria no encontrada o inactiva" }, { status: 404 });

  const fecha = new Date(fecha_pago);
  const monto = Number(honorario.monto_neto);

  const svc = new ContabilidadService(prisma);
  let ctx: Awaited<ReturnType<typeof svc.resolverContexto>>;
  try {
    ctx = await svc.resolverContexto(["2101", "1101"], "EGRESO", fecha);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }

  const glosa = observacion ?? `Pago honorario #${id} - ${honorario.proveedor.nombre}`;
  const partidas = [
    { cuenta_id: ctx.cuentas.get("2101")!.id, tipo: TipoMovimientoContable.DEBE,  monto, glosa },
    { cuenta_id: ctx.cuentas.get("1101")!.id, tipo: TipoMovimientoContable.HABER, monto, glosa },
  ];

  const resultado = await prisma.$transaction(async (tx) => {
    await tx.egresoTesoreria.create({
      data: {
        cuenta_id: cuenta_bancaria_id,
        proveedor_id: honorario.proveedor_id,
        categoria: "Pago honorario",
        descripcion: glosa,
        monto,
        fecha_egreso: fecha,
        estado: "PAGADO",
        referencia: referencia ?? null,
      },
    });

    await tx.movimientoTesoreria.create({
      data: {
        cuenta_id: cuenta_bancaria_id,
        tipo: TipoMovimientoTesoreria.EGRESO,
        descripcion: glosa,
        monto,
        fecha_movimiento: fecha,
        referencia: referencia ?? null,
      },
    });

    await tx.comprobanteContable.create({
      data: {
        tipo_id: ctx.tipo.id,
        numero: ctx.tipo.siguiente_numero,
        fecha_comprobante: fecha,
        descripcion: glosa,
        estado: EstadoComprobante.APROBADO,
        total_debe: monto,
        total_haber: monto,
        usuario_id: Number(session.userId),
        partidas: { create: partidas },
      },
    });
    await tx.tipoComprobanteContable.update({
      where: { id: ctx.tipo.id },
      data: { siguiente_numero: { increment: 1 } },
    });

    return tx.honorarioRecibido.update({
      where: { id: Number(id) },
      data: { pagado: true },
    });
  });

  return NextResponse.json(resultado);
}
