import { NextResponse } from "next/server";

export function assertCrmApiAuth(request: Request) {
  const expected = process.env.CRM_INTERNAL_API_KEY ?? null;
  if (!expected) throw new Error("CRM_INTERNAL_API_KEY no configurado.");

  const apiKey = request.headers.get("x-api-key");
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;

  if ((apiKey && apiKey === expected) || (bearer && bearer === expected)) return;
  throw new Error("No autorizado.");
}

export function unauthorizedCrmResponse() {
  return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
}
