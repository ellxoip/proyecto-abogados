import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@/lib/db-enums";
import { withSystemRls } from "@/lib/rls";
import { logAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/services/credentials";
import { verifyIntegrationAuth, getCorrelationId } from "@/lib/integration-auth";
import { normalizeRut } from "@/lib/identity";

/**
 * POST /api/internal/integration/clients/password-sync
 *
 * Sincronización entrante de contraseña desde hive-financial-control.
 *
 * Se invoca cuando el cliente cambia su contraseña en PagaCuotas — fc
 * actualiza su hash interno y luego propaga a service-control vía este
 * endpoint para que el mismo cliente pueda autenticarse en ambos
 * portales con la misma clave.
 *
 * Idempotente: si el cliente no existe en sc (caso no creado todavía)
 * respondemos 404 sin fallar. El próximo `cases` POST sincronizará el
 * hash al crear el User.
 *
 * Auth: `x-api-key` o `Authorization: Bearer …` = INTEGRATION_INTERNAL_API_KEY.
 */

const schema = z.object({
  rut: z.string().min(1),
  password_plain: z.string().min(6),
  correlation_id: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
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

  const { rut, password_plain, correlation_id, source } = parsed.data;
  const normalizedRut = normalizeRut(rut);
  const corrId = getCorrelationId(req, correlation_id);

  try {
    const passwordHash = await hashPassword(password_plain);

    const outcome = await withSystemRls(async (tx) => {
      const client = await tx.user.findFirst({
        where: { rut: normalizedRut, role: Role.CLIENTE },
      });
      if (!client) return { found: false as const };

      await tx.user.update({
        where: { id: client.id },
        data: {
          passwordHash,
          mustChangePassword: false,
        },
      });

      await logAudit({
        tx,
        action: "PASSWORD_CHANGED",
        actorId: client.id,
        message: `Contraseña sincronizada desde ${source ?? "PagaCuotas"}.`,
        metadata: { correlation_id: corrId, source: source ?? "PagaCuotas" },
      });

      return { found: true as const, clientId: client.id };
    });

    if (!outcome.found) {
      return NextResponse.json(
        { ok: false, error: "Cliente no encontrado en service-control." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, clientId: outcome.clientId }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
