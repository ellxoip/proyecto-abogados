import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/server/auth/session";
import { EstadoContrato, EstadoCuota } from "@prisma/client";
import { PagaCuotasNotifyService } from "@/server/services/integrations/pagacuotas-notify.service";

const schema = z.object({
  cliente_id: z.number().int().positive(),
  tipo_servicio: z.string().min(1).max(200),
  fecha_contrato: z.string().min(1),
  monto_ccto: z.number().positive(),
  monto_pago_inicial: z.number().nonnegative(),
  cantidad_cuotas: z.number().int().min(1).max(120),
  fecha_primera_cuota: z.string().min(1),
  observaciones: z.string().max(2000).optional().nullable(),
});

function roundMoney(v: number) {
  return Math.round(v * 100) / 100;
}

export async function POST(request: Request) {
  try {
    await requireSessionUser();
    const body = await request.json();
    const data = schema.parse(body);

    const cliente = await prisma.cliente.findUnique({
      where: { id: data.cliente_id },
      select: { id: true, rut: true, nombre: true, email: true, telefono: true },
    });
    if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

    const totalAmount = roundMoney(data.monto_ccto);
    const initialFee = roundMoney(Math.min(data.monto_pago_inicial, totalAmount));
    const saldoFinanciado = roundMoney(totalAmount - initialFee);
    const firstDue = new Date(data.fecha_primera_cuota);
    const installmentsCount = data.cantidad_cuotas;

    const result = await prisma.$transaction(async (tx) => {
      const contrato = await tx.contrato.create({
        data: {
          cliente_id: data.cliente_id,
          tipo_servicio: data.tipo_servicio.trim(),
          fecha_contrato: new Date(data.fecha_contrato),
          monto_ccto: totalAmount,
          monto_pago_inicial: initialFee,
          saldo_financiado: saldoFinanciado,
          cantidad_cuotas_original: installmentsCount,
          estado: EstadoContrato.PENDING_INITIAL_PAYMENT,
          observaciones: data.observaciones?.trim() || null,
        },
      });

      // Cuota 1 = pago inicial
      const cuotas = [
        tx.cuota.create({
          data: {
            contrato_id: contrato.id,
            numero_cuota: 1,
            fecha_vencimiento: firstDue,
            monto_original: initialFee,
            monto_actual: initialFee,
            saldo_pendiente: initialFee,
            estado: EstadoCuota.PENDIENTE,
            cobrable: true,
          },
        }),
      ];

      // Cuotas restantes
      if (installmentsCount > 1 && saldoFinanciado > 0) {
        const remaining = installmentsCount - 1;
        const base = roundMoney(Math.floor((saldoFinanciado / remaining) * 100) / 100);
        const last = roundMoney(saldoFinanciado - base * (remaining - 1));

        for (let i = 2; i <= installmentsCount; i++) {
          const due = new Date(firstDue);
          due.setMonth(due.getMonth() + (i - 1));
          const monto = i === installmentsCount ? last : base;
          cuotas.push(
            tx.cuota.create({
              data: {
                contrato_id: contrato.id,
                numero_cuota: i,
                fecha_vencimiento: due,
                monto_original: monto,
                monto_actual: monto,
                saldo_pendiente: monto,
                estado: EstadoCuota.PENDIENTE,
                cobrable: false,
              },
            }),
          );
        }
      }

      await Promise.all(cuotas);
      return contrato;
    });

    // Side-effect: auto-genera credenciales PagaCuotas + paymentLink y
    // los pushea a service-control para que el botón "Pagar" del portal
    // del cliente quede listo en cuanto se crea el contrato. Idempotente
    // por contratoId; si falla queda pendiente para retry-sweep.
    void new PagaCuotasNotifyService()
      .scheduleClientCreation({
        clienteId: data.cliente_id,
        contratoId: result.id,
        rut: cliente.rut ?? "",
        nombre: cliente.nombre ?? "",
        email: cliente.email ?? null,
        telefono: cliente.telefono ?? null,
        crmLeadId: null,
        correlationId: null,
      })
      .catch((err) => {
        console.error("[contratos.POST] scheduleClientCreation falló:", err);
      });

    return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    const msg = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
