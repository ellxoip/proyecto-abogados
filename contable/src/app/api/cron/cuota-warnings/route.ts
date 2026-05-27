import { NextResponse } from "next/server";
import { runDailyWarnings } from "@/server/services/cuota-warnings.service";

/**
 * POST /api/cron/cuota-warnings
 *
 * Endpoint disparable por:
 *   - Vercel Cron (production): vercel.json `crons: [{ path: "/api/cron/cuota-warnings", schedule: "0 9 * * *" }]`.
 *   - GitHub Actions / cron externo: curl con header `x-cron-secret`.
 *   - Local: `npm run warnings:tick`.
 *
 * Seguridad: requiere header `x-cron-secret` que coincida con env `CRON_SECRET`.
 * Aceptamos también `Authorization: Bearer <secret>` para integraciones que no
 * permiten headers custom.
 *
 * Idempotente. Si se llama dos veces el mismo día, las cuotas que ya tienen
 * `CuotaWarning` registrado para el nivel correspondiente no reciben otro envío.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorize(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const headerSecret = req.headers.get("x-cron-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return headerSecret === expected || bearer === expected;
}

export async function POST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runDailyWarnings();
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// Vercel Cron envía GET. Soportamos ambos.
export async function GET(req: Request) {
  return POST(req);
}
