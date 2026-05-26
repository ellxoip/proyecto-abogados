import { NextRequest, NextResponse } from "next/server";

/**
 * Flow.cl Webhook Adapter — DISABLED
 *
 * Esta ruta queda intencionalmente deshabilitada hasta que se implemente la
 * integración real:
 *   1) Validar el token contra la API de Flow.cl (fetchFlowStatus(token)).
 *   2) Mapear commerceOrder al Case real y verificar amount/status firmados.
 *   3) Habilitar recordPaymentEvent SOLO con datos validados por el proveedor.
 *
 * La implementación anterior aceptaba cualquier POST y registraba PaymentEvent
 * con datos mock hardcoded (caseId AT-MOCK-001, monto 150000). Esto permitía
 * insertar pagos falsos en la DB. Documento en `lib/payments.ts`:
 *   "There are NO external payment providers in this project."
 *
 * Si se reactiva, mover los mocks a un test fixture y NUNCA llamar
 * recordPaymentEvent sin la respuesta firmada de Flow.
 */
export async function POST(_req: NextRequest) {
  console.warn("[Flow Webhook] DISABLED — integración real pendiente. Request rechazado.");
  return NextResponse.json(
    { ok: false, error: "Webhook deshabilitado: integración Flow no implementada" },
    { status: 503 },
  );
}
