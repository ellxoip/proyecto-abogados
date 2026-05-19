import { NextRequest, NextResponse } from "next/server";

/**
 * Transbank Webpay Plus Webhook Adapter — DISABLED
 *
 * Esta ruta queda intencionalmente deshabilitada hasta que se implemente la
 * integración real:
 *   1) Confirmar token_ws contra la API de Transbank (transbank-sdk
 *      WebpayPlus.Transaction.commit()).
 *   2) Validar response_code === 0 y status === "AUTHORIZED" desde la respuesta
 *      firmada del proveedor (no desde un mock).
 *   3) Habilitar recordPaymentEvent SOLO con buy_order/amount validados.
 *
 * La implementación anterior aceptaba cualquier POST y registraba PaymentEvent
 * con datos mock hardcoded (caseId AT-MOCK-002, monto 50000). Documento en
 * `lib/payments.ts`:
 *   "There are NO external payment providers in this project."
 *
 * Si se reactiva, mover los mocks a un test fixture y NUNCA llamar
 * recordPaymentEvent sin la respuesta firmada de Transbank.
 */
export async function POST(_req: NextRequest) {
  console.warn("[Webpay Webhook] DISABLED — integración real pendiente. Request rechazado.");
  return NextResponse.json(
    { ok: false, error: "Webhook deshabilitado: integración Webpay no implementada" },
    { status: 503 },
  );
}
