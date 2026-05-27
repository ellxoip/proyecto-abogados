import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkMutationRole } from "@/server/auth/roles";
import { ContabilidadService } from "@/server/services/contabilidad/contabilidad.service";
import { EstadoComprobante, TipoMovimientoContable } from "@prisma/client";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error: authError } = await checkMutationRole();
  if (authError) return authError;

  const { id } = await params;
  const { estado, observaciones } = await req.json();

  const rendicion = await prisma.rendicionCajaChica.findUnique({
    where: { id: Number(id) },
    include: { gastos: true },
  });
  if (!rendicion) return NextResponse.json({ error: "Rendición no encontrada" }, { status: 404 });
  if (estado === "APROBADA" && rendicion.estado === "APROBADA") {
    return NextResponse.json({ error: "Rendición ya está aprobada" }, { status: 422 });
  }

  if (estado === "APROBADA") {
    const fecha = new Date();
    const total = Number(rendicion.total_gastos);

    const svc = new ContabilidadService(prisma);
    let ctx: Awaited<ReturnType<typeof svc.resolverContexto>>;
    try {
      ctx = await svc.resolverContexto(["5101", "1103"], "AJUSTE", fecha);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 422 });
    }

    const glosa = `Rendición caja chica #${id} aprobada`;
    const partidas = [
      { cuenta_id: ctx.cuentas.get("5101")!.id, tipo: TipoMovimientoContable.DEBE,  monto: total, glosa },
      { cuenta_id: ctx.cuentas.get("1103")!.id, tipo: TipoMovimientoContable.HABER, monto: total, glosa },
    ];

    await prisma.$transaction(async (tx) => {
      await tx.rendicionCajaChica.update({
        where: { id: Number(id) },
        data: { estado: "APROBADA", observaciones, aprobado_por: Number(session.userId) },
      });

      await tx.comprobanteContable.create({
        data: {
          tipo_id: ctx.tipo.id,
          numero: ctx.tipo.siguiente_numero,
          fecha_comprobante: fecha,
          descripcion: glosa,
          estado: EstadoComprobante.APROBADO,
          total_debe: total,
          total_haber: total,
          usuario_id: Number(session.userId),
          partidas: { create: partidas },
        },
      });
      await tx.tipoComprobanteContable.update({
        where: { id: ctx.tipo.id },
        data: { siguiente_numero: { increment: 1 } },
      });
    });

    const updated = await prisma.rendicionCajaChica.findUnique({ where: { id: Number(id) } });
    return NextResponse.json(updated);
  }

  const rendicionActualizada = await prisma.rendicionCajaChica.update({
    where: { id: Number(id) },
    data: { estado, observaciones },
  });
  return NextResponse.json(rendicionActualizada);
}
