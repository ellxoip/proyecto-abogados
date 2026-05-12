import { NextRequest, NextResponse } from "next/server";
import { onboardClientFromCRM, CrmLeadPayload } from "@/lib/services/crm-onboarding";

/**
 * CRM Webhook — Receives validated leads from Dante
 * 
 * POST /api/webhooks/crm
 * 
 * Dante validates the lead in the CRM, then sends it here.
 * AT Informa performs the "Double Check" (SuperAdmin reviews in Bandeja),
 * then assigns the case to a lawyer → IN_PROGRESS.
 * 
 * Expected payload:
 * {
 *   fullName: string,        // Client's full name
 *   email: string,           // Client's email (becomes username)
 *   phone: string,           // Client's phone (+569...)
 *   category: string,        // Legal category (LABORAL, CIVIL, etc.)
 *   invoiceUrl?: string,     // Receipt/proof of payment (if paid)
 *   caseCode?: string        // Optional case code from CRM
 * }
 */
export async function POST(req: NextRequest) {
  // Validate webhook secret
  const secret = process.env.CRM_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRM webhook not configured" }, { status: 503 });
  }
  const signature = req.headers.get("x-webhook-signature");
  if (signature !== secret) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Parse and validate payload
  const parsed = parsePayload(body);
  if (!parsed) {
    return NextResponse.json(
      { error: "Invalid payload. Required: fullName, email, phone, category" },
      { status: 400 }
    );
  }

  try {
    const result = await onboardClientFromCRM(parsed);

    return NextResponse.json({
      ok: true,
      caseId: result.caseId,
      caseCode: result.caseCode,
      clientId: result.clientId,
      isNewClient: result.isNewClient,
      isPaid: result.isPaid,
      message: result.isPaid
        ? "Lead ingresado con pago confirmado. Credenciales enviadas al cliente."
        : "Lead ingresado SIN pago. Se envió solicitud de pago inicial.",
    });
  } catch (err) {
    console.error("[CRM Webhook] Error processing lead:", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

function parsePayload(b: unknown): CrmLeadPayload | null {
  if (!b || typeof b !== "object") return null;
  const o = b as Record<string, unknown>;

  const fullName = typeof o.fullName === "string" ? o.fullName.trim() : null;
  const email = typeof o.email === "string" ? o.email.trim().toLowerCase() : null;
  const phone = typeof o.phone === "string" ? o.phone.trim() : null;
  const category = typeof o.category === "string" ? o.category.trim() : null;

  // These 4 are mandatory
  if (!fullName || !email || !phone || !category) return null;

  return {
    fullName,
    email,
    phone,
    category,
    invoiceUrl: typeof o.invoiceUrl === "string" ? o.invoiceUrl : undefined,
    caseCode: typeof o.caseCode === "string" ? o.caseCode : undefined,
  };
}
