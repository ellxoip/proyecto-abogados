import { NextResponse } from "next/server";
import { requireSessionUser } from "@/server/auth/session";
import { ClientImportService } from "@/server/services/client-import.service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  try {
    await requireSessionUser();
    const { itemId } = await context.params;
    const parsedId = Number(itemId);

    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return NextResponse.json({ ok: false, error: "itemId invalido." }, { status: 400 });
    }

    type CorregirPayload = { action: "manual"; montoTotal?: number };
    let payload: CorregirPayload | null = null;
    try {
      payload = (await request.json()) as CorregirPayload;
    } catch {
      payload = null;
    }

    if (!payload?.action || payload.action !== "manual") {
      return NextResponse.json(
        { ok: false, error: "action debe ser 'manual'." },
        { status: 400 },
      );
    }

    const manualMontoTotal =
      payload.montoTotal !== undefined ? Number(payload.montoTotal) : undefined;

    if (manualMontoTotal === undefined || isNaN(manualMontoTotal) || manualMontoTotal <= 0) {
      return NextResponse.json(
        { ok: false, error: "montoTotal debe ser un numero mayor a 0." },
        { status: 400 },
      );
    }

    const service = new ClientImportService();
    const result = await service.corregirContratoItem(parsedId, "manual", manualMontoTotal);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    const lower = message.toLowerCase();
    const status = lower.includes("autoriz")
      ? 401
      : lower.includes("no encontrado")
        ? 404
        : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
