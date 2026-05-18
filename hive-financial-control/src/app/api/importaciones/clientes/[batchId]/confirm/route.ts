import { NextResponse } from "next/server";
import { requireSessionUser } from "@/server/auth/session";
import { ClientImportService } from "@/server/services/client-import.service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  try {
    await requireSessionUser();
    const { batchId } = await context.params;
    const parsedId = Number(batchId);

    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return NextResponse.json({ ok: false, error: "batchId invalido." }, { status: 400 });
    }

    type ConfirmPayload = {
      onlyReady?: boolean;
      allowReview?: boolean;
      skipNonReady?: boolean;
    };

    let payload: ConfirmPayload | null = null;
    try {
      payload = (await request.json()) as ConfirmPayload;
    } catch {
      payload = null;
    }

    const onlyReady =
      typeof payload?.onlyReady === "boolean"
        ? payload.onlyReady
        : typeof payload?.skipNonReady === "boolean"
          ? payload.skipNonReady
          : undefined;
    const allowReview =
      typeof payload?.allowReview === "boolean" ? payload.allowReview : undefined;

    const service = new ClientImportService();
    const report = await service.confirmImport(parsedId, {
      onlyReady,
      allowReview,
    });

    return NextResponse.json({
      ok: true,
      batchId: parsedId,
      report,
    });
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
