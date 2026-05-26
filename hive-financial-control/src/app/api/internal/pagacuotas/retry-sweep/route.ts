import { NextResponse } from "next/server";
import { assertInternalApiAuth } from "@/server/auth/internal-api";
import { safeEqual } from "@/server/auth/timing-safe";
import { PagaCuotasNotifyService } from "@/server/services/integrations/pagacuotas-notify.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SweepBody = { limit?: number; dryRun?: boolean };

/**
 * Dual auth: acepta cualquiera de
 *   - assertInternalApiAuth (PAGACUOTAS_INTERNAL_API_KEY / INTERNAL_API_KEY,
 *     vía x-api-key/x-internal-api-key/Bearer)
 *   - CRON_SECRET (Bearer o header x-cron-secret) — usado por Vercel Cron.
 */
function authorize(request: Request): boolean {
  try {
    assertInternalApiAuth(request);
    return true;
  } catch {
    // fall through to cron secret check
  }
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const headerSecret = request.headers.get("x-cron-secret");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return (
    (!!headerSecret && safeEqual(headerSecret, cronSecret)) ||
    (!!bearer && safeEqual(bearer, cronSecret))
  );
}

/**
 * POST /api/internal/pagacuotas/retry-sweep
 *
 * Reintenta IntegrationEvent[pagacuotas.client.from-crm] que quedaron en PENDING
 * porque el primer push (durante handleOpportunityAccepted) falló.
 *
 * Idempotente. Cada attempt incrementa `attempts` en result_payload. A los 8
 * attempts marca el evento FAILED y requiere intervención manual.
 *
 * Triggers:
 *   - Vercel Cron (production, GET): vercel.json schedule cada 12 minutos.
 *   - cURL/integraciones internas (POST): body opcional `{ limit, dryRun }`.
 */
async function runSweep(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: SweepBody = {};
  if (request.method !== "GET") {
    try {
      body = (await request.json()) as SweepBody;
    } catch {
      body = {};
    }
  }

  const limit = Math.max(1, Math.min(100, body.limit ?? 25));
  const dryRun = Boolean(body.dryRun);

  const service = new PagaCuotasNotifyService();
  const pending = await service.listPending(limit);

  const summary = {
    processed: 0,
    success: 0,
    stillPending: 0,
    failed: 0,
    dryRun,
    items: [] as Array<{
      integrationEventId: number;
      contratoId: string | null;
      status: "success" | "pending" | "failed" | "skipped";
      attempts?: number;
      error?: string;
    }>,
  };

  for (const event of pending) {
    summary.processed += 1;
    const contratoId = event.external_event_id;

    if (dryRun) {
      summary.items.push({
        integrationEventId: event.id,
        contratoId,
        status: "skipped",
      });
      continue;
    }

    try {
      const result = await service.retryEvent(event.id);
      if (result.ok) {
        summary.success += 1;
        summary.items.push({
          integrationEventId: event.id,
          contratoId,
          status: "success",
        });
      } else {
        const reachedMax = result.attempts >= 8;
        if (reachedMax) summary.failed += 1;
        else summary.stillPending += 1;
        summary.items.push({
          integrationEventId: event.id,
          contratoId,
          status: reachedMax ? "failed" : "pending",
          attempts: result.attempts,
          error: result.error,
        });
      }
    } catch (err) {
      summary.failed += 1;
      summary.items.push({
        integrationEventId: event.id,
        contratoId,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ok: true, summary });
}

export async function POST(request: Request) {
  return runSweep(request);
}

// Vercel Cron envía GET por default.
export async function GET(request: Request) {
  return runSweep(request);
}
