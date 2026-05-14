import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Role } from "@/lib/db-enums";
import { withSystemRls } from "@/lib/rls";
import { logAudit } from "@/lib/audit";
import { generateClientPassword } from "@/lib/services/crm-onboarding";

function assertIntegrationAuth(req: Request) {
  const expected = process.env.INTEGRATION_INTERNAL_API_KEY ?? null;
  if (!expected) throw new Error("INTEGRATION_INTERNAL_API_KEY no configurado.");

  const apiKey = req.headers.get("x-api-key");
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;

  if ((apiKey && apiKey === expected) || (bearer && bearer === expected)) return;
  throw new Error("No autorizado.");
}

const schema = z.object({
  rut: z.string().min(1),
  nombre: z.string().min(1),
  email: z.string().email().optional().nullable(),
  telefono: z.string().optional().nullable(),
  payment_link: z.string().url(),
  crm_lead_id: z.union([z.string(), z.number()]).optional().nullable(),
  correlation_id: z.string().optional().nullable(),
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
    return NextResponse.json({ ok: false, error: "Body JSON invalido." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Payload invalido.", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { rut, nombre, email, telefono, payment_link, crm_lead_id, correlation_id } = parsed.data;

  try {
    const normalizedRut = rut.replace(/\./g, "").toLowerCase().trim();
    const phone = telefono ?? "+00000000000";
    const safeEmail = email ?? `integracion-${normalizedRut}@noreply.internal`;
    const plainPassword = generateClientPassword(nombre, phone);
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    const result = await withSystemRls(async (tx) => {
      let client = await tx.user.findFirst({
        where: { rut: normalizedRut, role: Role.CLIENTE },
      });

      if (!client && email) {
        client = await tx.user.findFirst({
          where: { email: safeEmail, role: Role.CLIENTE },
        });
      }

      if (!client) {
        client = await tx.user.create({
          data: {
            fullName: nombre,
            email: safeEmail,
            phone,
            role: Role.CLIENTE,
            passwordHash,
            rut: normalizedRut,
            paymentLink: payment_link,
            active: true,
          },
        });
      } else {
        client = await tx.user.update({
          where: { id: client.id },
          data: {
            fullName: client.fullName || nombre,
            email: client.email || safeEmail,
            phone: client.phone || phone,
            rut: client.rut ?? normalizedRut,
            paymentLink: payment_link,
            active: true,
          },
        });
      }

      await logAudit({
        tx,
        action: "PAYMENT_LINK_ATTACHED",
        actorId: client.id,
        message: "Cliente creado/actualizado con enlace seguro de PagaCuotas.",
        metadata: JSON.stringify({ crm_lead_id, correlation_id }),
      });

      return { clientId: client.id, email: client.email };
    });

    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
