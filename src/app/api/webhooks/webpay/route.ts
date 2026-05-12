import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus } from "@prisma/client";
import { recordPaymentEvent } from "@/lib/payments";

/**
 * Transbank Webpay Plus Webhook Adapter
 * 
 * Transbank redirige al usuario o envía un POST/GET con `token_ws`.
 * Este endpoint funciona como URL de Confirmación (Return URL).
 * Se debe confirmar la transacción con la API de Transbank usando el token.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const params = new URLSearchParams(body);
    const token_ws = params.get("token_ws");

    if (!token_ws) {
      return NextResponse.json({ error: "No token_ws provided" }, { status: 400 });
    }

    // TODO: Usar transbank-sdk para confirmar la transacción:
    // const tx = new WebpayPlus.Transaction(new Options(IntegrationCommerceCodes.WEBPAY_PLUS, IntegrationApiKeys.WEBPAY, Environment.Integration));
    // const response = await tx.commit(token_ws);
    
    // Simulación de respuesta de Transbank:
    const mockWebpayResponse = {
      vci: "TSY",
      amount: 50000,
      status: "AUTHORIZED", // AUTHORIZED = Pagado
      buy_order: "AT-MOCK-002", // Debería ser el caseId
      session_id: "session123",
      card_detail: { card_number: "6623" },
      accounting_date: "0525",
      transaction_date: "2023-05-25T15:30:00Z",
      authorization_code: "123456",
      payment_type_code: "VN",
      response_code: 0, // 0 = Aprobado
      installments_number: 0
    };

    const isApproved = mockWebpayResponse.response_code === 0 && mockWebpayResponse.status === "AUTHORIZED";
    const paymentStatus = isApproved ? PaymentStatus.PAID : PaymentStatus.UNPAID;

    if (paymentStatus === PaymentStatus.PAID) {
      const result = await recordPaymentEvent({
        caseId: mockWebpayResponse.buy_order,
        status: paymentStatus,
        amount: mockWebpayResponse.amount,
        externalId: mockWebpayResponse.authorization_code,
      });

      console.log("[Webpay Webhook] Payment confirmed and recorded:", result);
    }

    // Retorna redirect o HTML si es el navegador del usuario, o 200 OK si es S2S
    return NextResponse.json({ ok: true, status: mockWebpayResponse.status });
  } catch (err) {
    console.error("[Webpay Webhook] Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
