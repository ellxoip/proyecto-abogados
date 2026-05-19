import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@/lib/db-enums";
import { withSystemRls } from "@/lib/rls";
import { logAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/services/credentials";
import { verifyIntegrationAuth, getCorrelationId } from "@/lib/integration-auth";
import { normalizeRut, normalizeEmail, normalizePhone } from "@/lib/identity";

/**
 * POST /api/internal/integration/clients/payment-link
 *
 * Llamado por hive-financial-control al generar el enlace de PagaCuotas
 * para un cliente. Persistimos:
 *   - `paymentLink` para que el portal redirija al portal de pagos correcto.
 *   - El hash de la MISMA password que financial-control generó y nexio
 *     entregará al cliente. Esa password sirve para PagaCuotas y para
 *     este portal (modelo unificado). El cliente la rotará en el primer
 *     login: marcamos `mustChangePassword = true`.
 *
 * Solo actualizamos el hash si el cliente aún no rotó su password. Si ya
 * la cambió, no la tocamos (cliente soberano).
 *
 * Auth: `x-api-key` o `Authorization: Bearer …` = INTEGRATION_INTERNAL_API_KEY.
 */

const schema = z.object({
  rut: z.string().min(1),
  nombre: z.string().min(1),
  email: z.string().email(),
  telefono: z.string().min(8),
  payment_link: z.string().url(),
  password_plain: z.string().min(6),
  crm_lead_id: z.union([z.string(), z.number()]).optional().nullable(),
  correlation_id: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  if (!verifyIntegrationAuth(req, { kind: "internal" })) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body JSON invalido." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Payload invalido.", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { rut, nombre, email, telefono, payment_link, password_plain, crm_lead_id, correlation_id } = parsed.data;
  const corrId = getCorrelationId(req, correlation_id);

  try {
    const normalizedRut = normalizeRut(rut);
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(telefono);
    const passwordHash = await hashPassword(password_plain);

    const result = await withSystemRls(async (tx) => {
      let client = await tx.user.findFirst({
        where: { rut: normalizedRut, role: Role.CLIENTE },
      });
      if (!client) {
        client = await tx.user.findFirst({
          where: { email: normalizedEmail, role: Role.CLIENTE },
        });
      }

      if (!client) {
        client = await tx.user.create({
          data: {
            fullName: nombre,
            email: normalizedEmail,
            phone: normalizedPhone,
            role: Role.CLIENTE,
            passwordHash,
            rut: normalizedRut,
            paymentLink: payment_link,
            mustChangePassword: true,
            active: true,
          },
        });
      } else {
        const shouldSyncHash = client.mustChangePassword === true;
        client = await tx.user.update({
          where: { id: client.id },
          data: {
            ...(shouldSyncHash ? { passwordHash } : {}),
            fullName: client.fullName || nombre,
            phone: client.phone || normalizedPhone,
            rut: client.rut ?? normalizedRut,
            paymentLink: payment_link,
            active: true,
          },
        });
      }

      await logAudit({
        tx,
        action: "PAYMENT_RECORDED",
        actorId: client.id,
        message: "Cliente creado/actualizado con enlace seguro de PagaCuotas y credenciales sincronizadas.",
        metadata: { crm_lead_id, correlation_id: corrId, payment_link },
      });

      return { clientId: client.id, email: client.email };
    });

    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
