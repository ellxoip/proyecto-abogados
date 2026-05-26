import { NextResponse, type NextRequest } from "next/server";
import { PaymentPortalService } from "@/server/services/integrations/payment-portal.service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ identifier: string }> },
) {
  try {
    const { identifier } = await context.params;
    const service = new PaymentPortalService();
    const result = await service.getDeudasByIdentifier(identifier);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    const status = message.includes("no encontrado") ? 404 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
