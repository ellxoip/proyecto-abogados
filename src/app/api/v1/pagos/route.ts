import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { withSystemRls } from "@/lib/rls";
import { reactivateCaseIfPaid, forceHalt } from "@/lib/case-health";

/**
 * POST /api/v1/pagos
 *
 * El sistema de contabilidad notifica un pago o una mora al sistema HIVE CONTROL.
 *
 * Autenticación: Bearer <EXTERNAL_API_KEY>
 */

const schema = z.object({
  caso_id: z.string().uuid(),
  estado: z.enum(["PAID", "UNPAID", "OVERDUE", "RESTORED"]),
  monto: z.number().min(0),
  comprobante: z.string().url().nullable().optional(),
  referencia: z.string().nullable().optional(),
  
  // Nuevos campos para identificar y actualizar
  payment_event_id: z.string().uuid().optional(),
  numero_cuota: z.number().int().min(1).optional(),
  fecha_pago: z.string().datetime().optional(), // ISO datetime
  monto_pagado: z.number().min(0).optional(),
});

export async function POST(req: NextRequest) {
  const authError = requireApiKey(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const {
      caso_id,
      estado,
      monto,
      comprobante,
      referencia,
      payment_event_id,
      numero_cuota,
      fecha_pago,
      monto_pagado,
    } = parsed.data;

    const result = await withSystemRls(async (tx) => {
      // 1. Buscar la cuota si viene ID o (caso + numero)
      const eventId = payment_event_id;
      let existingEvent = null;

      if (eventId) {
        existingEvent = await tx.paymentEvent.findUnique({ where: { id: eventId } });
      } else if (numero_cuota) {
        existingEvent = await tx.paymentEvent.findFirst({
          where: { caseId: caso_id, numero_cuota: numero_cuota },
        });
      }

      const isPaid = estado === "PAID" || estado === "RESTORED";
      const finalMontoPagado = isPaid ? (monto_pagado ?? monto) : (monto_pagado ?? existingEvent?.monto_pagado ?? 0);
      const finalPagadoEn = isPaid ? (fecha_pago ? new Date(fecha_pago) : new Date()) : existingEvent?.pagado_en;

      let event;
      if (existingEvent) {
        // Actualizar
        event = await tx.paymentEvent.update({
          where: { id: existingEvent.id },
          data: {
            status: estado,
            amount: new Prisma.Decimal(monto),
            monto_pagado: new Prisma.Decimal(finalMontoPagado),
            receipt_url: comprobante ?? existingEvent.receipt_url,
            pagado_en: finalPagadoEn,
          },
        });
      } else {
        // Crear
        event = await tx.paymentEvent.create({
          data: {
            caseId: caso_id,
            status: estado,
            amount: new Prisma.Decimal(monto),
            monto_pagado: new Prisma.Decimal(finalMontoPagado),
            numero_cuota,
            receipt_url: comprobante ?? null,
            pagado_en: finalPagadoEn,
          },
        });
      }

      // 2. Ejecutar efectos secundarios en el caso
      let caseHealth = null;
      if (isPaid) {
        caseHealth = await reactivateCaseIfPaid(tx, caso_id);
      } else if (estado === "OVERDUE") {
        await forceHalt(tx, caso_id, "Cuota vencida — reportado por contabilidad");
      }

      return { event, caseHealth };
    });

    return NextResponse.json({
      success: true,
      pago_id: result.event.id,
      caso_reactivado: result.caseHealth !== null,
      registrado_en: result.event.createdAt,
      referencia: referencia ?? null,
    });
  } catch (err: any) {
    if (err?.code === "P2025" || err?.message?.includes("Record to update not found")) {
      return NextResponse.json(
        { success: false, error: "El caso_id o payment_event_id no existe." },
        { status: 404 }
      );
    }

    console.error("[API v1] POST /pagos error:", err);
    return NextResponse.json(
      { success: false, error: err.message ?? "Error interno del servidor." },
      { status: 500 }
    );
  }
}
