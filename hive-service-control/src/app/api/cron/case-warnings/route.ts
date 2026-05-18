import { NextResponse } from "next/server";
import { runDailyCaseWarnings } from "@/lib/case-warnings";

/**
 * Cron diario de warnings de morosidad sobre Casos.
 *
 * Triggers:
 *   - Vercel Cron (vercel.json `{ path: "/api/cron/case-warnings", schedule: "0 9 * * *" }`).
 *   - GitHub Actions / cron externo / SO via curl con `x-cron-secret`.
 *
 * Idempotente. Si se ejecuta varias veces el mismo día, las únicas escrituras
 * son sobre casos que cruzaron un nuevo umbral.
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
    const summary = await runDailyCaseWarnings();
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
