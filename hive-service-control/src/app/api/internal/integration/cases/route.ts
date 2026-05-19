import { NextResponse } from "next/server";
import { z } from "zod";
import { CaseStage, Role } from "@/lib/db-enums";
import { withSystemRls } from "@/lib/rls";
import { logAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/services/credentials";
import { verifyIntegrationAuth, getCorrelationId } from "@/lib/integration-auth";
import { normalizeRut, normalizeEmail, normalizePhone } from "@/lib/identity";

/**
 * POST /api/internal/integration/cases
 *
 * Llamado por hive-financial-control cuando un contrato pasa a ACTIVE
 * (pago inicial confirmado en PagaCuotas). Crea o reutiliza el cliente
 * y el caso en hive-service-control.
 *
 * Modelo de credenciales unificado
 * --------------------------------
 *  - financial-control genera UNA password al crear el enlace de
 *    PagaCuotas y la envía al cliente vía nexio (WhatsApp + Email).
 *  - Esa MISMA password sirve para iniciar sesión en este portal.
 *  - El cliente está obligado a cambiarla en el primer login: setemos
 *    `User.mustChangePassword = true` y el portal redirige a
 *    `/portal/cambiar-password` hasta que se rote.
 *  - service-control NO envía credenciales (nexio ya lo hizo). Solo
 *    sincroniza el hash recibido.
 *
 * Idempotencia
 * ------------
 *  - Caso: por `case_code` (Case.code @unique). Una segunda llamada
 *    actualiza metadatos sin duplicar.
 *  - Password: solo actualizamos el hash si el cliente aún no rotó su
 *    password (mustChangePassword == true). Si ya la cambió, dejamos
 *    intacto el hash para no romper su sesión.
 *
 * Auth: `x-api-key` o `Authorization: Bearer …` = INTEGRATION_INTERNAL_API_KEY.
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


const schema = z.object({
  rut: z.string().min(1),
  nombre: z.string().min(1),
  email: z.string().email(),
  telefono: z.string().min(8),
  // Password en plano generada por hive-financial-control.
  // Llega por canal interno autenticado (TLS + API key) — no se persiste
  // en plaintext, solo se hashea con bcrypt antes de guardarse.
  password_plain: z.string().min(6),
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

  const {
    rut,
    nombre,
    email,
    telefono,
    password_plain,
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

  const normalizedRut = normalizeRut(rut);
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(telefono);
  const corrId = getCorrelationId(req, correlation_id);
  const category = (service_category ?? "OTRO").toUpperCase();

  try {
    // Hash fuera de la transacción: bcrypt cuesta ~100ms y no debe ocupar
    // un conexión Prisma todo ese tiempo.
    const passwordHash = await hashPassword(password_plain);

    const txOutcome = await withSystemRls(async (tx) => {
      // 1. Resolver cliente por RUT, luego por email.
      let client = await tx.user.findFirst({
        where: { rut: normalizedRut, role: Role.CLIENTE },
      });
      if (!client) {
        client = await tx.user.findFirst({
          where: { email: normalizedEmail, role: Role.CLIENTE },
        });
      }

      let wasClientCreated = false;
      if (!client) {
        client = await tx.user.create({
          data: {
            fullName: nombre,
            email: normalizedEmail,
            phone: normalizedPhone,
            role: Role.CLIENTE,
            passwordHash,
            rut: normalizedRut,
            paymentLink: payment_link ?? null,
            mustChangePassword: true,
            active: true,
          },
        });
        wasClientCreated = true;
      } else {
        // Solo sincronizamos el hash de financial si el cliente todavía
        // no rotó su password. Si ya la cambió (mustChangePassword=false),
        // dejamos intacto el hash — el cliente es soberano de sus
        // credenciales desde ese momento.
        const shouldSyncHash = client.mustChangePassword === true;
        client = await tx.user.update({
          where: { id: client.id },
          data: {
            ...(shouldSyncHash ? { passwordHash } : {}),
            rut: client.rut ?? normalizedRut,
            paymentLink: payment_link ?? client.paymentLink,
            active: true,
          },
        });
      }

      // 2. Categoría.
      const cat = await tx.category.upsert({
        where: { name: category },
        update: {},
        create: { name: category },
      });

      // 3. Caso — idempotente por case_code.
      const existingCase = await tx.case.findUnique({ where: { code: case_code } });
      const metadataPayload = {
        source: source ?? "NEXIO",
        crm_lead_id,
        crm_opportunity_id,
        correlation_id: corrId,
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

      const wasCaseCreated = !existingCase;

      // 4. OT como Update con document_url y subcarpeta.
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
        action: "PAYMENT_RECORDED",
        caseId: kase.id,
        message: wasCaseCreated
          ? `Caso creado desde ${source ?? "NEXIO"}. Pago inicial confirmado. Cliente debe rotar password al primer login.${work_order ? ` OT ${work_order.type ?? ""} adjuntada.` : ""}`
          : `Caso actualizado desde ${source ?? "NEXIO"}.${work_order ? ` OT ${work_order.type ?? ""} sincronizada.` : ""}`,
      });

      return {
        wasClientCreated,
        wasCaseCreated,
        result: {
          caseId: kase.id,
          clientId: client.id,
          clientEmail: client.email,
          clientPhone: client.phone,
          wasCreated: wasCaseCreated,
          updateId,
        },
      };
    });

    return NextResponse.json(
      { ok: true, ...txOutcome.result },
      { status: txOutcome.wasCaseCreated ? 201 : 200 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
