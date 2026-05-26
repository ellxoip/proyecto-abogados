/**
 * POST /api/integrations/crm/pago-comprometido
 *
 * Backward-compatible alias for the CRM→SIS.CONTABLE onboarding trigger.
 * The CRM (FastAPI) calls this endpoint when a lead reaches pago_comprometido.
 * Delegates to the same CrmIntegrationService as /opportunities/accepted.
 *
 * Legacy payload shape:
 * {
 *   crmLeadId, rut, nombre, email, phone,
 *   honorarios, cuotaInicial, numCuotas, tipoServicio, fechaIngreso
 * }
 */
import { NextResponse } from "next/server";
import { assertCrmApiAuth, unauthorizedCrmResponse } from "@/server/auth/crm-api";
import { CrmIntegrationService } from "@/server/services/integrations/crm-integration.service";

export async function POST(request: Request) {
  try {
    assertCrmApiAuth(request);
  } catch {
    return unauthorizedCrmResponse();
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body JSON inválido." }, { status: 400 });
  }

  try {
    const service = new CrmIntegrationService();
    const result = await service.handleOpportunityAccepted(body);

    if (!result.ok && result.status === "PENDING_REVIEW") {
      return NextResponse.json(result, { status: 202 });
    }

    const httpStatus = result.status === "created" ? 201 : 200;
    return NextResponse.json(
      {
        ...result,
        clienteId: result.clienteId,
        contratoId: result.contratoId,
        ok: result.ok,
      },
      { status: httpStatus },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
