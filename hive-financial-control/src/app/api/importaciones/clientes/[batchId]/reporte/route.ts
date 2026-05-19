import { NextResponse } from "next/server";
import { requireSessionUser } from "@/server/auth/session";
import { ClientImportService } from "@/server/services/client-import.service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  try {
    await requireSessionUser();
    const { batchId } = await context.params;
    const parsedId = Number(batchId);

    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return NextResponse.json({ ok: false, error: "batchId invalido." }, { status: 400 });
    }

    const service = new ClientImportService();
    const report = await service.getBatchReport(parsedId);

    return new NextResponse(JSON.stringify(report, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename=\"importacion-clientes-batch-${parsedId}.json\"`,
      },
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
