import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus } from "@/lib/db-enums";
import { recordPaymentEvent } from "@/lib/payments";

/**
 * Flow.cl Webhook Adapter
 * 
 * Flow envía un POST con form-data conteniendo el parámetro `token`.
 * Con este token, debes hacer una petición a la API de Flow para obtener
 * los detalles reales del pago y evitar suplantaciones.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const token = formData.get("token");

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "No token provided" }, { status: 400 });
    }

    // TODO: Llamar a la API de Flow para validar el pago usando el token
    // const flowResponse = await fetchFlowStatus(token);
    // Para esta versión, simularemos la traducción de los datos validados:
    
    // Asumimos que flowResponse nos devuelve commerceOrder (caseId), status (2 = pagado), amount.
    const mockFlowResponse = {
      commerceOrder: "AT-MOCK-001", // Debería ser el Case ID o Code
      status: 2, // 2 = Pagado en Flow
      amount: 150000,
      flowOrder: 123456789,
      urlComprobante: "https://www.flow.cl/comprobante/123",
    };

    // Translator (Adapter) Logic
    const paymentStatus = mockFlowResponse.status === 2 ? PaymentStatus.PAID : PaymentStatus.UNPAID;

    // Solo registramos si es pagado o si hay lógica para otros estados
    if (paymentStatus === PaymentStatus.PAID) {
      const result = await recordPaymentEvent({
        caseId: mockFlowResponse.commerceOrder, // Asegúrate de enviar el caseId correcto
        status: paymentStatus,
        amount: mockFlowResponse.amount,
        receiptUrl: mockFlowResponse.urlComprobante,
        externalId: mockFlowResponse.flowOrder.toString(),
      });

      console.log("[Flow Webhook] Payment validated and recorded:", result);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Flow Webhook] Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
