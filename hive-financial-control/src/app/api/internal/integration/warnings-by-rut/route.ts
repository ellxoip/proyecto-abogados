import { NextResponse } from "next/server";
import { getWarningSummaryByRuts } from "@/server/services/warnings-query.service";

/**
 * GET /api/internal/integration/warnings-by-rut?ruts=rut1,rut2,...
 *
 * Devuelve el resumen real de warnings emitidos para una lista de RUTs.
 * Pensado para que hive-service-control refleje fielmente el estado de
 * morosidad de cada cliente en su dashboard, sin duplicar la lógica del cron.
 *
 * Auth: header `Authorization: Bearer <HIVE_SERVICE_INTEGRATION_API_KEY>`.
 * Mismo secreto que ya usa hive-service-control para llamar a financial-warning,
 * sólo que en dirección inversa.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorize(req: Request): boolean {
  const expected = process.env.HIVE_SERVICE_INTEGRATION_API_KEY;
  if (!expected) return false;
  const auth = req.headers.get("authorization");
  const bearer = auth?.replace(/^Bearer\s+/i, "");
  const apiKey = req.headers.get("x-api-key");
  return bearer === expected || apiKey === expected;
}

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const rutsParam = searchParams.get("ruts");
  if (!rutsParam) {
    return NextResponse.json({ ok: false, error: "Missing 'ruts' query param" }, { status: 400 });
  }

  const ruts = rutsParam
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);

  if (ruts.length === 0) {
    return NextResponse.json({ ok: true, summaries: [] });
  }
  if (ruts.length > 200) {
    return NextResponse.json(
      { ok: false, error: "Demasiados RUTs (máx. 200 por request)" },
      { status: 400 },
    );
  }

  try {
    const summaries = await getWarningSummaryByRuts(ruts);
    return NextResponse.json({ ok: true, summaries });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
