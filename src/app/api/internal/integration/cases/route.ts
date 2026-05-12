import { NextResponse } from "next/server";
import { z } from "zod";
import { CaseStage, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { withSystemRls } from "@/lib/rls";
import { logAudit } from "@/lib/audit";
import { generateClientPassword } from "@/lib/services/crm-onboarding";

/**
 * POST /api/internal/integration/cases
 *
 * Called by SIS.CONTABLE (Integration Layer) after a contract becomes ACTIVE
 * (initial payment confirmed). Creates the legal case in AT.Informa.
 *
 * Auth: x-api-key or Bearer matching INTEGRATION_INTERNAL_API_KEY env var.
 */

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
  case_code: z.string().min(1),
  service_category: z.string().optional().nullable(),
  crm_lead_id: z.number().optional().nullable(),
  crm_opportunity_id: z.string().optional().nullable(),
  correlation_id: z.string().optional().nullable(),
  initial_payment_amount: z.number().optional().nullable(),
  contrato_id_sis_contable: z.number().optional().nullable(),
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

  const {
    rut,
    nombre,
    email,
    telefono,
    case_code,
    service_category,
    crm_lead_id,
    crm_opportunity_id,
    correlation_id,
    initial_payment_amount,
    contrato_id_sis_contable,
  } = parsed.data;

  try {
    const normalizedRut = rut.replace(/\./g, "").toLowerCase().trim();
    const phone = telefono ?? "+00000000000";
    const safeEmail = email ?? `integracion-${normalizedRut}@noreply.internal`;
    const plainPassword = generateClientPassword(nombre, phone);
    const passwordHash = await bcrypt.hash(plainPassword, 10);
    const category = (service_category ?? "OTRO").toUpperCase();

    const result = await withSystemRls(async (tx) => {
      // 1. Find client by RUT, then email, then create
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
            active: true,
          },
        });
      } else {
        await tx.user.update({
          where: { id: client.id },
          data: {
            rut: client.rut ?? normalizedRut,
            active: true,
          },
        });
      }

      // 2. Resolve category
      const cat = await tx.category.upsert({
        where: { name: category },
        update: {},
        create: { name: category },
      });

      // 3. Create case — initial payment already confirmed
      const kase = await tx.case.create({
        data: {
          code: case_code,
          client_id: client.id,
          categoryId: cat.id,
          is_paid: true,
          stage: CaseStage.OPEN,
          metadata: {
            source: "SIS_CONTABLE",
            crm_lead_id,
            crm_opportunity_id,
            correlation_id,
            initial_payment_amount,
            contrato_id_sis_contable,
            ingested_at: new Date().toISOString(),
          },
        },
      });

      await logAudit({
        tx,
        action: "PAYMENT_RECORDED",
        caseId: kase.id,
        message: `Caso creado desde SIS.CONTABLE. Pago inicial confirmado. Contrato SIS: ${contrato_id_sis_contable ?? "N/A"}.`,
      });

      return { caseId: kase.id, clientId: client.id };
    });

    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
