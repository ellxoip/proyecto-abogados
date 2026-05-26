import { NextResponse } from "next/server";
import { requireSessionUser } from "@/server/auth/session";
import { ClientImportService } from "@/server/services/client-import.service";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSessionUser();
    const service = new ClientImportService();
    const result = await service.getPendientes();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    const status = message.toLowerCase().includes("autoriz") ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
