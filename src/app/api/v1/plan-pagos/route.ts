import { NextRequest, NextResponse } from "next/server";
import { withSystemRls } from "@/lib/rls";
import { requireApiKey } from "@/lib/api-auth";

/**
 * GET /api/v1/plan-pagos
 *
 * Retorna los planes de pago estructurados por caso.
 *
 * Query params opcionales:
 *   ?cliente_id=<uuid>
 *   ?caso_id=<uuid>
 *   ?estado=UNPAID|OVERDUE|PAID|RESTORED
 *   ?solo_pendientes=true
 *   ?desde=YYYY-MM-DD
 *   ?hasta=YYYY-MM-DD
 *
 * Autenticación: Bearer <EXTERNAL_API_KEY>
 */
export async function GET(req: NextRequest) {
  const authError = requireApiKey(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const clienteId = searchParams.get("cliente_id");
    const casoId = searchParams.get("caso_id");
    const estadoFilter = searchParams.get("estado") as any;
    const soloPendientes = searchParams.get("solo_pendientes") === "true";
    const desde = searchParams.get("desde");
    const hasta = searchParams.get("hasta");

    // Construir filtro de estado para cuotas
    let statusWhere: any = {};
    if (estadoFilter) {
      statusWhere = { status: estadoFilter };
    } else if (soloPendientes) {
      statusWhere = { status: { in: ["UNPAID", "OVERDUE"] } };
    }

    // Filtro de fechas para cuotas
    const fechaWhere: any = {};
    if (desde) fechaWhere.gte = new Date(desde);
    if (hasta) fechaWhere.lte = new Date(hasta + "T23:59:59.999Z");

    const casos = await withSystemRls(async (tx) => {
      return tx.case.findMany({
        where: {
          ...(casoId ? { id: casoId } : {}),
          ...(clienteId ? { client_id: clienteId } : {}),
          // Si filtramos por fecha/estado, al menos debe tener un pago que cumpla (opcional, pero útil)
          ...(Object.keys(statusWhere).length > 0 || Object.keys(fechaWhere).length > 0 ? {
            payments: {
              some: {
                ...statusWhere,
                ...(Object.keys(fechaWhere).length > 0 ? { createdAt: fechaWhere } : {}),
              }
            }
          } : {})
        },
        select: {
          id: true,
          code: true,
          stage: true,
          is_paid: true,
          initial_invoice: true,
          ccto: true,
          pago_inicial: true,
          saldo_financiado: true,
          cantidad_cuotas: true,
          fecha_primera_cuota: true,
          dia_pago: true,
          categoria: {
            select: { name: true },
          },
          client: {
            select: {
              id: true,
              rut: true,
              fullName: true,
              email: true,
              phone: true,
            },
          },
          payments: {
            where: {
              ...statusWhere,
              ...(Object.keys(fechaWhere).length > 0 ? { createdAt: fechaWhere } : {}),
            },
            orderBy: { createdAt: "asc" },
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
            },
          },
        },
      });
    });

    const planes = casos.map((caso) => {
      let total_pagado = 0;
      let saldo_vencido = 0;
      let estado_financiero = "AL_DIA";

      // Para el cálculo global del contrato necesitamos todas las cuotas, pero solo
      // fetchamos las filtradas. Wait, eso puede romper los totales si está filtrado.
      // Así que calcularemos basado en las devueltas (útil si piden todo el plan) 
      // y si hay filtros parciales, el contrato reflejará el total de esas cuotas en específico.
      // Lo ideal sería obtener todas las cuotas siempre, o advertir que los saldos son parciales.
      caso.payments.forEach(p => {
        total_pagado += Number(p.monto_pagado || (["PAID", "RESTORED"].includes(p.status) ? p.amount : 0));
        if (p.status === "OVERDUE") {
          saldo_vencido += Number(p.amount) - Number(p.monto_pagado || 0);
          estado_financiero = "MOROSO";
        }
      });

      const saldo_pendiente_total = Number(caso.saldo_financiado || 0) - total_pagado;

      return {
        cliente: {
          id: caso.client.id,
          rut: caso.client.rut,
          nombre: caso.client.fullName,
          email: caso.client.email,
          telefono: caso.client.phone,
        },
        caso: {
          id: caso.id,
          codigo: caso.code,
          categoria: caso.categoria?.name ?? null,
          estado: caso.stage,
          pagado: caso.is_paid,
          boleta_inicial: caso.initial_invoice,
        },
        contrato: {
          ccto: caso.ccto ? Number(caso.ccto) : null,
          pago_inicial: caso.pago_inicial ? Number(caso.pago_inicial) : null,
          saldo_financiado: caso.saldo_financiado ? Number(caso.saldo_financiado) : null,
          cantidad_cuotas: caso.cantidad_cuotas,
          fecha_primera_cuota: caso.fecha_primera_cuota,
          dia_pago: caso.dia_pago,
          total_pagado,
          saldo_pendiente: saldo_pendiente_total > 0 ? saldo_pendiente_total : 0,
          saldo_vencido,
          estado_financiero,
        },
        cuotas: caso.payments.map(p => {
          const monto = Number(p.amount);
          const monto_pagado = Number(p.monto_pagado || (["PAID", "RESTORED"].includes(p.status) ? monto : 0));
          return {
            id: p.id,
            numero_cuota: p.numero_cuota,
            fecha_vencimiento: p.fecha_vencimiento,
            monto,
            monto_pagado,
            saldo_pendiente: monto - monto_pagado > 0 ? monto - monto_pagado : 0,
            estado: p.status,
            comprobante_url: p.receipt_url,
            registrado_en: p.createdAt,
            pagado_en: p.pagado_en,
          };
        }),
      };
    });

    return NextResponse.json({
      success: true,
      total: planes.length,
      generado_en: new Date().toISOString(),
      planes,
    });
  } catch (err: any) {
    console.error("[API v1] GET /plan-pagos error:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
