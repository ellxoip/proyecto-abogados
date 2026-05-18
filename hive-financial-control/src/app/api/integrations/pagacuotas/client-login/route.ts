import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertInternalApiAuth, unauthorizedResponse } from "@/server/auth/internal-api";
import { PaymentPortalService } from "@/server/services/integrations/payment-portal.service";

const loginSchema = z.object({
  identifier: z.string().min(3),
  password: z.string().regex(/^[a-zA-Z0-9]{6}$/),
});

const updatePasswordSchema = z.object({
  identifier: z.string().min(3),
  currentPassword: z.string().regex(/^[a-zA-Z0-9]{6}$/),
  newPassword: z.string().regex(/^[a-zA-Z0-9]{6}$/),
});

export async function POST(request: NextRequest) {
  try {
    assertInternalApiAuth(request);
    const body = loginSchema.parse(await request.json());
    const service = new PaymentPortalService();
    const result = await service.verifyPortalCredentials(body.identifier, body.password);

    if (!result) {
      return NextResponse.json(
        { ok: false, code: "CLIENT_INVALID_CREDENTIALS", message: "Credenciales invalidas." },
        { status: 401 },
      );
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === "No autorizado.") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertInternalApiAuth(request);
    const body = updatePasswordSchema.parse(await request.json());
    const service = new PaymentPortalService();
    const result = await service.updatePortalPassword(
      body.identifier,
      body.currentPassword,
      body.newPassword,
    );

    if (!result) {
      return NextResponse.json(
        { ok: false, code: "CLIENT_INVALID_CREDENTIALS", message: "Credenciales invalidas." },
        { status: 401 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "No autorizado.") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
