import { NextResponse } from "next/server";
import { z } from "zod";
import { NotificationType, Role } from "@/lib/db-enums";
import { withSystemRls } from "@/lib/rls";

/**
 * POST /api/integration/payment-needed
 *
 * Called by CRM (Dante) when a lead reaches 'pago_comprometido'.
 * Notifies all SUPER_ADMIN users so they can validate payment in Bandeja.
 *
 * Auth: x-integration-secret matching INTEGRATION_INGEST_SECRET env var.
 */

function assertIntegrationAuth(req: Request) {
  const expected = process.env.INTEGRATION_INGEST_SECRET ?? null;
  if (!expected) throw new Error("INTEGRATION_INGEST_SECRET no configurado.");
  const secret = req.headers.get("x-integration-secret");
  if (secret !== expected) throw new Error("No autorizado.");
}

const schema = z.object({
  crmLeadId: z.number(),
  caseId: z.string().optional().nullable(),
  fullName: z.string().min(1),
  honorarios: z.number().optional().nullable(),
  invoiceUrl: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  try {
    assertIntegrationAuth(req);
  } catch {
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

  const { crmLeadId, caseId, fullName, honorarios, invoiceUrl } = parsed.data;

  try {
    await withSystemRls(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { externalId: crmLeadId.toString() },
        select: { id: true },
      });

      const superAdmins = await tx.user.findMany({
        where: { role: Role.SUPER_ADMIN, active: true },
        select: { id: true },
      });

      if (superAdmins.length === 0) return;

      const montoFmt =
        honorarios != null
          ? ` (${new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" }).format(honorarios)})`
          : "";

      const body =
        `El cliente ${fullName}${montoFmt} ha comprometido pago en el CRM. Validar en Bandeja.` +
        (invoiceUrl ? " Comprobante adjunto." : "");

      await tx.notification.createMany({
        data: superAdmins.map((admin) => ({
          userId: admin.id,
          type: NotificationType.LEAD_NUEVO,
          title: `Pago comprometido: ${fullName}`,
          body,
          caseId: caseId ?? null,
          leadId: lead?.id ?? null,
        })),
      });
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
