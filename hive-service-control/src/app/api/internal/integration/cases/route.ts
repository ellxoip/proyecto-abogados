import { NextResponse } from "next/server";
import { z } from "zod";
import { CaseStage, Role } from "@/lib/db-enums";
import bcrypt from "bcryptjs";
import { withSystemRls } from "@/lib/rls";
import { logAudit } from "@/lib/audit";
import { generateClientPassword } from "@/lib/services/crm-onboarding";
import { sendEmailTemplate } from "@/lib/email-resend";
import { sendWhatsAppTemplate } from "@/lib/whatsapp-meta";

/**
 * POST /api/internal/integration/cases
 *
 * Called by SIS.CONTABLE (Integration Layer) after a contract becomes ACTIVE
 * (initial payment confirmed). Creates the legal case in AT.Informa.
 *
 * Auth: x-api-key or Bearer matching INTEGRATION_INTERNAL_API_KEY env var.
 */

function safeParseJson(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

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
  payment_link: z.string().url().optional().nullable(),
  source: z.string().optional().nullable(),
  financials: z.object({
    honorarios: z.number().optional().nullable(),
    cuota_inicial: z.number().optional().nullable(),
    num_cuotas: z.number().optional().nullable(),
    monto_cuota: z.number().optional().nullable(),
  }).optional().nullable(),
  team: z.object({
    vendedor: z.string().optional().nullable(),
    agendadora: z.string().optional().nullable(),
  }).optional().nullable(),
  work_order: z.object({
    id: z.number().optional().nullable(),
    type: z.string().optional().nullable(),
    status: z.string().optional().nullable(),
    is_copy: z.boolean().optional().nullable(),
    created_at: z.string().optional().nullable(),
    document_url: z.string().optional().nullable(),
    fields: z.record(z.string(), z.any()).optional().nullable(),
  }).optional().nullable(),
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
    payment_link,
    source,
    financials,
    team,
    work_order,
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
            paymentLink: payment_link ?? null,
            active: true,
          },
        });
      } else {
        await tx.user.update({
          where: { id: client.id },
          data: {
            rut: client.rut ?? normalizedRut,
            passwordHash,
            paymentLink: payment_link ?? client.paymentLink,
            active: true,
          },
        });
      }

      // 2. Resolve category (carpeta principal por área)
      const cat = await tx.category.upsert({
        where: { name: category },
        update: {},
        create: { name: category },
      });

      // 3. Case — idempotente por case_code. Si ya existe, reutilizamos.
      const existingCase = await tx.case.findUnique({ where: { code: case_code } });
      const metadataPayload = {
        source: source ?? "NEXIO",
        crm_lead_id,
        crm_opportunity_id,
        correlation_id,
        initial_payment_amount,
        contrato_id_sis_contable,
        financials: financials ?? null,
        team: team ?? null,
        ingested_at: new Date().toISOString(),
      };

      const kase = existingCase
        ? await tx.case.update({
            where: { id: existingCase.id },
            data: {
              client_id: client.id,
              categoryId: cat.id,
              is_paid: true,
              metadata: JSON.stringify({
                ...(existingCase.metadata ? safeParseJson(existingCase.metadata) : {}),
                ...metadataPayload,
              }),
            },
          })
        : await tx.case.create({
            data: {
              code: case_code,
              client_id: client.id,
              categoryId: cat.id,
              is_paid: true,
              stage: CaseStage.OPEN,
              metadata: JSON.stringify(metadataPayload),
            },
          });

      const wasCreated = !existingCase;

      // 4. Guardar OT como Update con document_url y subcarpeta en description
      let updateId: string | null = null;
      if (work_order) {
        const otLabel = work_order.type ?? "Orden de Trabajo";
        const subfolder = `[OT/${category}] ${otLabel}`;
        const fieldsSnippet = work_order.fields
          ? `\n\nDatos OT:\n${Object.entries(work_order.fields)
              .filter(([, v]) => v !== null && v !== "" && v !== undefined)
              .map(([k, v]) => `• ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
              .join("\n")}`
          : "";
        const description = `${subfolder}\nGenerada en NEXIO el ${
          work_order.created_at ?? new Date().toISOString()
        }.${fieldsSnippet}`;

        // Evitar duplicar la misma OT al reintentar
        const existingUpdate = await tx.update.findFirst({
          where: {
            caseId: kase.id,
            description: { startsWith: subfolder },
          },
          orderBy: { createdAt: "desc" },
        });

        const docUrl = work_order.document_url
          ? work_order.document_url.startsWith("http")
            ? work_order.document_url
            : `${(process.env.NEXIO_PUBLIC_URL ?? "http://localhost:8000").replace(/\/$/, "")}${work_order.document_url}`
          : null;

        if (existingUpdate) {
          const updated = await tx.update.update({
            where: { id: existingUpdate.id },
            data: { description, document_url: docUrl },
          });
          updateId = updated.id;
        } else {
          const created = await tx.update.create({
            data: {
              caseId: kase.id,
              description,
              document_url: docUrl,
            },
          });
          updateId = created.id;
        }
      }

      await logAudit({
        tx,
        action: wasCreated ? "PAYMENT_RECORDED" : "PAYMENT_UPDATED",
        caseId: kase.id,
        message: wasCreated
          ? `Caso creado desde ${source ?? "NEXIO"}. Pago comprometido confirmado.${work_order ? ` OT ${work_order.type ?? ""} adjuntada.` : ""}`
          : `Caso actualizado desde ${source ?? "NEXIO"}.${work_order ? ` OT ${work_order.type ?? ""} sincronizada.` : ""}`,
      });

      return {
        caseId: kase.id,
        clientId: client.id,
        clientEmail: client.email,
        clientPhone: client.phone,
        wasCreated,
        updateId,
      };
    });

    const credentialsBody = [
      "Tu pago fue confirmado y tu cuenta en Hive Service Control quedo activa.",
      `Usuario: ${safeEmail}`,
      `Contrasena temporal: ${plainPassword}`,
      `Portal: ${process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3001"}/login`,
      "Cambia tu contrasena despues del primer acceso.",
    ].join("\n");

    // Solo notificamos credenciales la primera vez que se crea el caso
    if (result.wasCreated) {
      if (email) {
        try {
          await sendEmailTemplate({
            toEmail: safeEmail,
            toName: nombre,
            caseCode: case_code,
            template: "client_credentials",
            body: credentialsBody,
          });
        } catch (e) {
          console.warn("[integration/cases] email notify failed:", e);
        }
      }

      if (telefono) {
        try {
          await sendWhatsAppTemplate({
            toPhoneE164: telefono,
            template: "client_credentials",
            variables: [nombre, safeEmail, plainPassword, `${process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3001"}/login`],
          });
        } catch (e) {
          console.warn("[integration/cases] whatsapp notify failed:", e);
        }
      }

      await withSystemRls((tx) =>
        tx.user.update({
          where: { id: result.clientId },
          data: { credentialsSentAt: new Date() },
        }),
      );
    }

    return NextResponse.json(
      { ok: true, ...result },
      { status: result.wasCreated ? 201 : 200 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
