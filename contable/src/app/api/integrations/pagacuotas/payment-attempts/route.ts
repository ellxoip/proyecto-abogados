import { NextResponse } from "next/server";
import { PagaCuotasIntegrationService } from "@/server/services/integrations/pagacuotas-integration.service";
import { assertInternalApiAuth, unauthorizedResponse } from "@/server/auth/internal-api";

export async function POST(request: Request) {
  try {
    assertInternalApiAuth(request);
    const payload = await request.json();
    const service = new PagaCuotasIntegrationService();
    const result = await service.registerPaymentAttempt(payload);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "No autorizado.") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
