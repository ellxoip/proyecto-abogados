import { safeEqual } from "@/lib/timing-safe";

/**
 * Auth centralizado para endpoints de integración entre servicios.
 *
 * Reemplaza copias `apiKey === expected` repartidas en routes. Comparación
 * siempre en tiempo constante. Soporta múltiples credenciales/headers para
 * cubrir los tres canales del proyecto:
 *
 *   - Internal (hive-financial-control → hive-service-control):
 *       x-api-key  o  Authorization: Bearer <key>
 *       env: INTEGRATION_INTERNAL_API_KEY
 *
 *   - Ingest CRM (Dante → hive-service-control):
 *       x-integration-secret
 *       env: INTEGRATION_INGEST_SECRET
 *
 *   - Cron externo (Vercel/GitHub Actions):
 *       x-cron-secret  o  Authorization: Bearer <key>
 *       env: CRON_SECRET
 *
 * Uso:
 *   if (!verifyIntegrationAuth(req, { kind: "internal" })) {
 *     return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
 *   }
 */

export type AuthKind = "internal" | "ingest" | "cron";

const ENV_VAR: Record<AuthKind, string> = {
  internal: "INTEGRATION_INTERNAL_API_KEY",
  ingest: "INTEGRATION_INGEST_SECRET",
  cron: "CRON_SECRET",
};

const HEADERS: Record<AuthKind, readonly string[]> = {
  internal: ["x-api-key", "authorization"],
  ingest: ["x-integration-secret", "authorization"],
  cron: ["x-cron-secret", "authorization"],
};

function extractCandidate(req: Request, header: string): string | null {
  const raw = req.headers.get(header);
  if (!raw) return null;
  if (header === "authorization") {
    const match = raw.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
  }
  return raw.trim();
}

export function verifyIntegrationAuth(
  req: Request,
  opts: { kind: AuthKind },
): boolean {
  const expected = process.env[ENV_VAR[opts.kind]];
  if (!expected) return false; // env no seteado = denegar (fail-closed)

  for (const header of HEADERS[opts.kind]) {
    const candidate = extractCandidate(req, header);
    if (candidate && safeEqual(candidate, expected)) return true;
  }
  return false;
}

/**
 * Extrae correlation_id del request, ya sea como header (`x-correlation-id`)
 * o desde el body si fue parseado por el caller. Genera uno si no existe.
 * Úsalo para propagar trace IDs end-to-end entre microservicios.
 */
export function getCorrelationId(req: Request, bodyCorrelationId?: string | null): string {
  const headerCid = req.headers.get("x-correlation-id");
  if (headerCid && headerCid.length > 0 && headerCid.length <= 128) return headerCid;
  if (bodyCorrelationId && bodyCorrelationId.length > 0 && bodyCorrelationId.length <= 128) {
    return bodyCorrelationId;
  }
  // crypto.randomUUID disponible en Node 16+ y Edge runtimes.
  return `svc-${cryptoRandomUUID()}`;
}

function cryptoRandomUUID(): string {
  // Usa crypto.randomUUID si está disponible; fallback simple.
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
