import { NextResponse } from "next/server";
import { assertInternalApiAuth, unauthorizedResponse } from "@/server/auth/internal-api";
import { PagaCuotasIntegrationService } from "@/server/services/integrations/pagacuotas-integration.service";

export async function POST(request: Request) {
  try {
    assertInternalApiAuth(request);
    const payload = await request.json();
    const service = new PagaCuotasIntegrationService();
    const result = await service.validatePaymentIntent(payload);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "No autorizado.") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ valid: false, errors: [message] }, { status: 400 });
  }
}
