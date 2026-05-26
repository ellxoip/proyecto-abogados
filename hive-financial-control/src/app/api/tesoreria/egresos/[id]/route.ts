import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkMutationRole } from "@/server/auth/roles";
import { EstadoComprobante, TipoMovimientoContable, TipoMovimientoTesoreria } from "@prisma/client";

const EgresoPatchSchema = z.object({
  estado: z.enum(["PENDIENTE", "APROBADO", "PAGADO", "RECHAZADO"]).optional(),
  descripcion: z.string().min(1).optional(),
  referencia: z.string().optional(),
  observacion: z.string().optional(),
  fecha_egreso: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error: authError } = await checkMutationRole();
  if (authError) return authError;

  const { id } = await params;
  const parsed = EgresoPatchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", detalles: parsed.error.flatten() }, { status: 400 });

  const body = parsed.data;
  const updateData: Record<string, unknown> = { ...body };
  if (body.fecha_egreso) updateData.fecha_egreso = new Date(body.fecha_egreso);

  const egreso = await prisma.egresoTesoreria.update({
    where: { id: Number(id) },
    data: updateData,
    include: { cuenta: { include: { banco: true } } },
  });

  if (body.estado === "PAGADO") {
    try {
      const [cuentaGasto, cuentaBanco, tipoComp] = await Promise.all([
        prisma.cuentaContable.findFirst({ where: { codigo: "5101" } }),
        prisma.cuentaContable.findFirst({ where: { codigo: "1101" } }),
        prisma.tipoComprobanteContable.findFirst({ where: { nombre: "EGRESO" } }),
      ]);

      if (cuentaGasto && cuentaBanco && tipoComp) {
        const monto = Math.abs(Number(egreso.monto));
        const fecha = egreso.fecha_egreso;

        const periodo = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
        const cierre = await prisma.cierreContable.findFirst({
          where: {
            OR: [
              { tipo: "MENSUAL", periodo },
              { tipo: "ANUAL", periodo: String(fecha.getFullYear()) },
            ],
          },
        });

        if (!cierre) {
          const descripcion = `Egreso pagado: ${egreso.descripcion}`;
          await prisma.$transaction([
            prisma.movimientoTesoreria.create({
              data: {
                cuenta_id: egreso.cuenta_id,
                tipo: TipoMovimientoTesoreria.EGRESO,
                descripcion,
                monto,
                fecha_movimiento: fecha,
              },
            }),
            prisma.comprobanteContable.create({
              data: {
                tipo_id: tipoComp.id,
                numero: tipoComp.siguiente_numero,
                fecha_comprobante: fecha,
                descripcion,
                estado: EstadoComprobante.APROBADO,
                total_debe: monto,
                total_haber: monto,
                usuario_id: Number(session.userId),
                partidas: {
                  create: [
                    { cuenta_id: cuentaGasto.id, tipo: TipoMovimientoContable.DEBE, monto },
                    { cuenta_id: cuentaBanco.id, tipo: TipoMovimientoContable.HABER, monto },
                  ],
                },
              },
            }),
            prisma.tipoComprobanteContable.update({
              where: { id: tipoComp.id },
              data: { siguiente_numero: { increment: 1 } },
            }),
          ]);
        }
      }
    } catch {
      console.warn(`[egresos] Asiento contable no creado para egreso #${id}`);
    }
  }

  return NextResponse.json(egreso);
}
