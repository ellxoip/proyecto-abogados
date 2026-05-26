import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkMutationRole } from "@/server/auth/roles";
import { ContabilidadService } from "@/server/services/contabilidad/contabilidad.service";
import { EstadoComprobante, TipoMovimientoContable, TipoMovimientoTesoreria } from "@prisma/client";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error: authError } = await checkMutationRole();
  if (authError) return authError;

  const { id } = await params;
  const { estado } = await req.json();

  const repo = await prisma.reposicionCajaChica.findUnique({
    where: { id: Number(id) },
    include: { rendicion: { include: { fondo: true } } },
  });
  if (!repo) return NextResponse.json({ error: "Reposición no encontrada" }, { status: 404 });
  if (repo.estado === "PAGADA") return NextResponse.json({ error: "Reposición ya está pagada" }, { status: 422 });

  if (estado === "APROBADA") {
    const reposicion = await prisma.reposicionCajaChica.update({
      where: { id: Number(id) },
      data: { estado: "APROBADA", aprobado_por: Number(session.userId) },
    });
    return NextResponse.json(reposicion);
  }

  if (estado === "PAGADA") {
    const monto = Number(repo.monto);
    const fecha = new Date();

    const cuentaBancaria = await prisma.cuentaBancaria.findFirst({ where: { cuenta_principal: true, activa: true } });
    if (!cuentaBancaria) return NextResponse.json({ error: "No hay cuenta bancaria principal configurada" }, { status: 422 });

    const svc = new ContabilidadService(prisma);
    let ctx: Awaited<ReturnType<typeof svc.resolverContexto>>;
    try {
      ctx = await svc.resolverContexto(["1103", "1101"], "TRASPASO", fecha);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 422 });
    }

    const glosa = `Reposición caja chica #${id} - ${repo.rendicion.fondo.nombre}`;
    const partidas = [
      { cuenta_id: ctx.cuentas.get("1103")!.id, tipo: TipoMovimientoContable.DEBE,  monto, glosa },
      { cuenta_id: ctx.cuentas.get("1101")!.id, tipo: TipoMovimientoContable.HABER, monto, glosa },
    ];

    await prisma.$transaction(async (tx) => {
      await tx.reposicionCajaChica.update({
        where: { id: Number(id) },
        data: { estado: "PAGADA" },
      });

      await tx.fondoCajaChica.update({
        where: { id: repo.rendicion.fondo_id },
        data: { saldo_actual: { increment: monto } },
      });

      await tx.movimientoTesoreria.create({
        data: {
          cuenta_id: cuentaBancaria.id,
          tipo: TipoMovimientoTesoreria.EGRESO,
          descripcion: glosa,
          monto,
          fecha_movimiento: fecha,
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
    });

    const updated = await prisma.reposicionCajaChica.findUnique({ where: { id: Number(id) } });
    return NextResponse.json(updated);
  }

  const reposicion = await prisma.reposicionCajaChica.update({
    where: { id: Number(id) },
    data: { estado },
  });
  return NextResponse.json(reposicion);
}
