import { NextResponse } from "next/server";
import { z } from "zod";
import { withSystemRls } from "@/lib/rls";
import { logAudit } from "@/lib/audit";
import { verifyIntegrationAuth, getCorrelationId } from "@/lib/integration-auth";

/**
 * POST /api/internal/integration/payment-receipt
 *
 * Llamado por hive-financial-control cada vez que un pago de PagaCuotas
 * (real o ficticio) queda confirmado. Vincula el comprobante al caso del
 * cliente como un Update con document_url, para que el abogado/cliente
 * puedan abrir el comprobante desde la ficha del caso en service-control.
 *
 * Identificación del caso:
 *  - Preferido: case_code = `SIS-<contratoId>`
 *  - Fallback: contrato_id_sis_contable buscado en Case.metadata
 *
 * Idempotencia:
 *  - Por external_payment_id (en Update.description). Una segunda llamada
 *    con el mismo external_payment_id actualiza el Update existente en vez
 *    de duplicar.
 *
 * Auth: x-api-key / Bearer = INTEGRATION_INTERNAL_API_KEY.
 */

const schema = z.object({
  external_payment_id: z.string().min(1),
  contrato_id_sis_contable: z.number().int().positive().optional().nullable(),
  case_code: z.string().min(1).optional().nullable(),
  receipt_url: z.string().url(),
  amount: z.number().nonnegative(),
  paid_at: z.string().datetime().optional().nullable(),
  provider: z.string().optional().nullable(),
  method: z.string().optional().nullable(),
  cliente_rut: z.string().optional().nullable(),
  cuota_numeros: z.array(z.number().int().nonnegative()).optional().nullable(),
  correlation_id: z.string().optional().nullable(),
});

function describeReceipt(input: z.infer<typeof schema>): string {
  const lines: string[] = ["[Comprobante de pago] PagaCuotas"];
  lines.push(`external_payment_id=${input.external_payment_id}`);
  if (input.provider) lines.push(`provider=${input.provider}${input.method ? `/${input.method}` : ""}`);
  if (typeof input.amount === "number") lines.push(`monto=${input.amount}`);
  if (input.paid_at) lines.push(`fecha=${input.paid_at}`);
  if (input.cuota_numeros && input.cuota_numeros.length > 0) {
    lines.push(`cuotas=${input.cuota_numeros.join(",")}`);
  }
  if (input.cliente_rut) lines.push(`rut=${input.cliente_rut}`);
  return lines.join(" · ");
}

export async function POST(req: Request) {
  if (!verifyIntegrationAuth(req, { kind: "internal" })) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body JSON inválido." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Payload inválido.", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const input = parsed.data;
  const caseCode = input.case_code
    ?? (input.contrato_id_sis_contable != null ? `SIS-${input.contrato_id_sis_contable}` : null);

  if (!caseCode) {
    return NextResponse.json(
      { ok: false, error: "Falta case_code o contrato_id_sis_contable." },
      { status: 422 },
    );
  }

  const corrId = getCorrelationId(req, input.correlation_id);

  try {
    const outcome = await withSystemRls(async (tx) => {
      const kase = await tx.case.findUnique({ where: { code: caseCode } });
      if (!kase) return { notFound: true as const };

      // Idempotency on Update.description containing external_payment_id.
      const tagFragment = `external_payment_id=${input.external_payment_id}`;
      const existing = await tx.update.findFirst({
        where: { caseId: kase.id, description: { contains: tagFragment } },
      });

      const description = describeReceipt(input);

      let updateId: string;
      let created = false;
      if (existing) {
        const updated = await tx.update.update({
          where: { id: existing.id },
          data: { description, document_url: input.receipt_url },
        });
        updateId = updated.id;
      } else {
        const newUpdate = await tx.update.create({
          data: {
            caseId: kase.id,
            description,
            document_url: input.receipt_url,
          },
        });
        updateId = newUpdate.id;
        created = true;
      }

      await logAudit({
        tx,
        action: "PAYMENT_RECORDED",
        caseId: kase.id,
        message: created
          ? `Comprobante de pago adjuntado al caso (PagaCuotas) · correlation=${corrId ?? "-"}`
          : `Comprobante de pago actualizado en el caso (PagaCuotas) · correlation=${corrId ?? "-"}`,
      });

      return {
        notFound: false as const,
        caseId: kase.id,
        updateId,
        created,
      };
    });

    if (outcome.notFound) {
      return NextResponse.json(
        { ok: false, error: `No existe caso con code=${caseCode}` },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        caseId: outcome.caseId,
        updateId: outcome.updateId,
        created: outcome.created,
      },
      { status: outcome.created ? 201 : 200 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
