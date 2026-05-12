import { NextRequest, NextResponse } from "next/server";
import { withSystemRls } from "@/lib/rls";
import { requireApiKey } from "@/lib/api-auth";

/**
 * GET /api/v1/clientes
 *
 * Retorna todos los clientes (rol CLIENTE) con sus casos jurídicos asociados.
 * Diseñado para sincronización con el sistema de contabilidad del contador.
 *
 * Query params opcionales:
 *   ?stage=OPEN|IN_PROGRESS|FINISHED|HALTED_BY_PAYMENT|WAITING_CUOTAS
 *   ?categoria=TRIBUTARIO|PENAL|CIVIL|LABORAL|FAMILIA|MIGRATORIO|OTRO
 *
 * Autenticación: Bearer <EXTERNAL_API_KEY>
 */
export async function GET(req: NextRequest) {
  const authError = requireApiKey(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const stageFilter = searchParams.get("stage") ?? undefined;
    const categoriaFilter = searchParams.get("categoria") ?? undefined;

    const clientes = await withSystemRls(async (tx) => {
      return tx.user.findMany({
        where: {
          role: "CLIENTE",
          active: true,
          casesAsClient: {
            some: {
              ...(stageFilter ? { stage: stageFilter as any } : {}),
              ...(categoriaFilter
                ? { categoria: { name: categoriaFilter } }
                : {}),
            },
          },
        },
        select: {
          id: true,
          rut: true,
          fullName: true,
          email: true,
          phone: true,
          createdAt: true,
          casesAsClient: {
            where: {
              ...(stageFilter ? { stage: stageFilter as any } : {}),
              ...(categoriaFilter
                ? { categoria: { name: categoriaFilter } }
                : {}),
            },
            select: {
              id: true,
              code: true,
              stage: true,
              is_paid: true,
              initial_invoice: true,
              unpaid_months: true,
              deadlineAt: true,
              resolvedAt: true,
              createdAt: true,
              updatedAt: true,
              ccto: true,
              pago_inicial: true,
              saldo_financiado: true,
              cantidad_cuotas: true,
              fecha_primera_cuota: true,
              dia_pago: true,
              categoria: {
                select: { name: true },
              },
              abogados: {
                select: { id: true, fullName: true, email: true },
              },
              payments: {
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
                },
              },
            },
          },
        },
        orderBy: { fullName: "asc" },
      });
    });

    // Calcular resumen de pagos por cliente
    const data = clientes.map((cliente) => ({
      id: cliente.id,
      rut: cliente.rut,
      nombre: cliente.fullName,
      email: cliente.email,
      telefono: cliente.phone,
      registrado_en: cliente.createdAt,
      total_casos: cliente.casesAsClient.length,
      casos: cliente.casesAsClient.map((caso) => {
        let total_pagado = 0;
        let saldo_vencido = 0;
        let estado_financiero = "AL_DIA";

        caso.payments.forEach(p => {
          total_pagado += Number(p.monto_pagado || (["PAID", "RESTORED"].includes(p.status) ? p.amount : 0));
          if (p.status === "OVERDUE") {
            saldo_vencido += Number(p.amount) - Number(p.monto_pagado || 0);
            estado_financiero = "MOROSO";
          }
        });

        const saldo_pendiente = Number(caso.saldo_financiado || 0) - total_pagado;

        return {
          id: caso.id,
          codigo: caso.code,
          estado: caso.stage,
          pagado: caso.is_paid,
          boleta_inicial: caso.initial_invoice,
          meses_impagos: caso.unpaid_months,
          categoria: caso.categoria?.name ?? null,
          ccto: caso.ccto ? Number(caso.ccto) : null,
          pago_inicial: caso.pago_inicial ? Number(caso.pago_inicial) : null,
          saldo_financiado: caso.saldo_financiado ? Number(caso.saldo_financiado) : null,
          cantidad_cuotas: caso.cantidad_cuotas,
          fecha_primera_cuota: caso.fecha_primera_cuota,
          dia_pago: caso.dia_pago,
          estado_financiero,
          total_pagado,
          saldo_pendiente: saldo_pendiente > 0 ? saldo_pendiente : 0,
          saldo_vencido,
          abogados: caso.abogados,
          vence_en: caso.deadlineAt,
          resuelto_en: caso.resolvedAt,
          creado_en: caso.createdAt,
          actualizado_en: caso.updatedAt,
          ultimos_pagos: caso.payments.slice(0, 5).map((p) => ({
            id: p.id,
            estado: p.status,
            monto: Number(p.amount),
            comprobante: p.receipt_url,
            registrado_en: p.createdAt,
          })),
        };
      }),
    }));

    return NextResponse.json({
      success: true,
      total: data.length,
      generado_en: new Date().toISOString(),
      clientes: data,
    });
  } catch (err: any) {
    console.error("[API v1] GET /clientes error:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
