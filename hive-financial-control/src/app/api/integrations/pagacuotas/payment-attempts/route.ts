import { NextResponse } from "next/server";
import { PagaCuotasIntegrationService } from "@/server/services/integrations/pagacuotas-integration.service";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const service = new PagaCuotasIntegrationService();
    const result = await service.registerPaymentAttempt(payload);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
