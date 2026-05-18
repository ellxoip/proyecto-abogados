import { NextResponse, type NextRequest } from "next/server";
import { PaymentPortalService } from "@/server/services/integrations/payment-portal.service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ contratoId: string }> },
) {
  try {
    const { contratoId } = await context.params;
    const service = new PaymentPortalService();
    const result = await service.getCuotasByContrato(contratoId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    const status = message.toLowerCase().includes("no encontrado") ? 404 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
