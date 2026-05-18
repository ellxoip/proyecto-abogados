import { NextResponse } from "next/server";
import { z } from "zod";
import { AtInformaSyncService } from "@/server/services/integrations/at-informa-sync.service";

const syncSchema = z
  .object({
    solo_pendientes: z.boolean().optional(),
    desde: z.string().date().optional(),
    hasta: z.string().date().optional(),
  })
  .optional();

export async function POST(request: Request) {
  try {
    const body = request.headers.get("content-length")
      ? await request.json()
      : undefined;
    const payload = syncSchema.parse(body);
    const service = new AtInformaSyncService();
    const result = await service.syncAll({
      soloPendientes: payload?.solo_pendientes,
      desde: payload?.desde,
      hasta: payload?.hasta,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
