import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@/lib/db-enums";
import { withSystemRls } from "@/lib/rls";
import { logAudit } from "@/lib/audit";
import { verifyIntegrationAuth, getCorrelationId } from "@/lib/integration-auth";
import { normalizeRut } from "@/lib/identity";
import { signMagicLink } from "@/lib/magic-link";

/**
 * POST /api/internal/integration/clients/auto-login
 *
 * Genera una URL de auto-login (magic-link) para un cliente identificado
 * por RUT. PagaCuotas la invoca al confirmar un pago para derivar al
 * cliente directamente al portal sin que tenga que volver a autenticarse.
 *
 * El token JWT tiene `ttl = 60s` y `purpose = "magic-link"`, firmado con
 * `AUTH_SECRET`. La validación + creación de sesión NextAuth ocurre en
 * `/auth/magic-link?token=...` vía el provider Credentials id=`magic-link`.
 *
 * Auth: `x-api-key` o `Authorization: Bearer …` = INTEGRATION_INTERNAL_API_KEY.
 */

const schema = z.object({
  rut: z.string().min(1),
  ttl_seconds: z.number().int().positive().max(300).optional(),
  source: z.string().optional().nullable(),
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
    return NextResponse.json({ ok: false, error: "Body JSON inválido." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Payload inválido.", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { rut, ttl_seconds, source, correlation_id } = parsed.data;
  const normalizedRut = normalizeRut(rut);
  const corrId = getCorrelationId(req, correlation_id);

  try {
    const result = await withSystemRls(async (tx) => {
      const client = await tx.user.findFirst({
        where: { rut: normalizedRut, role: Role.CLIENTE, active: true },
      });
      if (!client) return { found: false as const };

      const token = signMagicLink(client.id, ttl_seconds ?? 60);

      await logAudit({
        tx,
        action: "LOGIN_SUCCESS",
        actorId: client.id,
        channel: "system",
        message: `Magic-link emitido para ${source ?? "PagaCuotas"} (post-pago).`,
        metadata: { correlation_id: corrId, source: source ?? "PagaCuotas", ttl_seconds: ttl_seconds ?? 60 },
      });

      return { found: true as const, clientId: client.id, token };
    });

    if (!result.found) {
      return NextResponse.json(
        { ok: false, error: "Cliente no encontrado en service-control." },
        { status: 404 },
      );
    }

    const appUrl = (process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3001").replace(/\/$/, "");
    const redirectUrl = `${appUrl}/auth/magic-link?token=${encodeURIComponent(result.token)}`;

    return NextResponse.json(
      { ok: true, clientId: result.clientId, redirectUrl, token: result.token, ttl_seconds: ttl_seconds ?? 60 },
      { status: 200 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
