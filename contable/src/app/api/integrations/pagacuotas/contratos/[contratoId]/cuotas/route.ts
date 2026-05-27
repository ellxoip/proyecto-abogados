import { NextResponse, type NextRequest } from "next/server";
import { assertInternalApiAuth, unauthorizedResponse } from "@/server/auth/internal-api";
import { PaymentPortalService } from "@/server/services/integrations/payment-portal.service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ contratoId: string }> },
) {
  try {
    assertInternalApiAuth(request);
    const { contratoId } = await context.params;
    const service = new PaymentPortalService();
    const result = await service.getInternalContractInstallments(contratoId);
    return NextResponse.json({ contrato_id: contratoId, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === "No autorizado.") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Error interno";
    const status = message.toLowerCase().includes("no encontrado") ? 404 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
