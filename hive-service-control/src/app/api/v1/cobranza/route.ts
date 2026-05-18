import { NextRequest, NextResponse } from "next/server";
import { withSystemRls } from "@/lib/rls";
import { requireApiKey } from "@/lib/api-auth";

/**
 * GET /api/v1/cobranza
 *
 * Retorna todos los pagos pendientes y vencidos del sistema.
 * Incluye datos del cliente y el caso al que pertenece cada pago.
 * Diseñado para el módulo de cobranza del sistema de contabilidad.
 *
 * Query params opcionales:
 *   ?estado=UNPAID|OVERDUE|PAID|RESTORED   (filtra por PaymentStatus)
 *   ?solo_pendientes=true                  (atajo: UNPAID + OVERDUE)
 *   ?cliente_id=<uuid>                     (filtra por cliente)
 *   ?caso_id=<uuid>                        (filtra por caso)
 *   ?desde=YYYY-MM-DD                      (pagos desde esta fecha)
 *   ?hasta=YYYY-MM-DD                      (pagos hasta esta fecha)
 *
 * Autenticación: Bearer <EXTERNAL_API_KEY>
 */
export async function GET(req: NextRequest) {
  const authError = requireApiKey(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const estadoFilter = searchParams.get("estado") as any;
    const soloPendientes = searchParams.get("solo_pendientes") === "true";
    const clienteId = searchParams.get("cliente_id");
    const casoId = searchParams.get("caso_id");
    const desde = searchParams.get("desde");
    const hasta = searchParams.get("hasta");

    // Construir filtro de estado
    let statusWhere: any = {};
    if (estadoFilter) {
      statusWhere = { status: estadoFilter };
    } else if (soloPendientes) {
      statusWhere = { status: { in: ["UNPAID", "OVERDUE"] } };
    }

    // Filtro de fechas
    const fechaWhere: any = {};
    if (desde) fechaWhere.gte = new Date(desde);
    if (hasta) fechaWhere.lte = new Date(hasta + "T23:59:59.999Z");

    const pagos = await withSystemRls(async (tx) => {
      return tx.paymentEvent.findMany({
        where: {
          ...statusWhere,
          ...(Object.keys(fechaWhere).length > 0 ? { createdAt: fechaWhere } : {}),
          ...(casoId ? { caseId: casoId } : {}),
          ...(clienteId ? { case: { client_id: clienteId } } : {}),
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          amount: true,
          monto_pagado: true,
          numero_cuota: true,
          fecha_vencimiento: true,
          pagado_en: true,
          receipt_url: true,
          createdAt: true,
          case: {
            select: {
              id: true,
              code: true,
              stage: true,
              is_paid: true,
              unpaid_months: true,
              initial_invoice: true,
              ccto: true,
              pago_inicial: true,
              saldo_financiado: true,
              cantidad_cuotas: true,
              categoria: { select: { name: true } },
              client: {
                select: {
                  id: true,
                  rut: true,
                  fullName: true,
                  email: true,
                  phone: true,
                },
              },
            },
          },
        },
      });
    });

    // Calcular totales agrupados
    const resumen = {
      total_registros: pagos.length,
      monto_total: 0,
      por_estado: {} as Record<string, { cantidad: number; monto: number }>,
    };

    for (const p of pagos) {
      const monto = Number(p.amount);
      resumen.monto_total += monto;

      if (!resumen.por_estado[p.status]) {
        resumen.por_estado[p.status] = { cantidad: 0, monto: 0 };
      }
      resumen.por_estado[p.status].cantidad++;
      resumen.por_estado[p.status].monto += monto;
    }

    const data = pagos.map((p) => {
      const monto = Number(p.amount);
      const monto_pagado = Number(p.monto_pagado || (["PAID", "RESTORED"].includes(p.status) ? monto : 0));
      return {
        id: p.id,
        numero_cuota: p.numero_cuota,
        fecha_vencimiento: p.fecha_vencimiento,
        estado: p.status,
        monto,
        monto_pagado,
        saldo_pendiente: monto - monto_pagado > 0 ? monto - monto_pagado : 0,
        comprobante_url: p.receipt_url,
        registrado_en: p.createdAt,
        pagado_en: p.pagado_en,
        caso: {
          id: p.case.id,
          codigo: p.case.code,
          etapa: p.case.stage,
          pagado: p.case.is_paid,
          meses_impagos: p.case.unpaid_months,
          boleta_inicial: p.case.initial_invoice,
          categoria: p.case.categoria?.name ?? null,
          ccto: p.case.ccto ? Number(p.case.ccto) : null,
          pago_inicial: p.case.pago_inicial ? Number(p.case.pago_inicial) : null,
          saldo_financiado: p.case.saldo_financiado ? Number(p.case.saldo_financiado) : null,
          cantidad_cuotas: p.case.cantidad_cuotas,
        },
        cliente: {
          id: p.case.client.id,
          rut: p.case.client.rut,
          nombre: p.case.client.fullName,
          email: p.case.client.email,
          telefono: p.case.client.phone,
        },
      };
    });

    return NextResponse.json({
      success: true,
      generado_en: new Date().toISOString(),
      resumen,
      pagos: data,
    });
  } catch (err: any) {
    console.error("[API v1] GET /cobranza error:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
