import { NextResponse } from "next/server";
import { safeEqual } from "./timing-safe";

function getExpectedApiKey() {
  return (
    process.env.PAGACUOTAS_INTERNAL_API_KEY ??
    process.env.INTERNAL_API_KEY ??
    null
  );
}

function getExpectedBearer() {
  return (
    process.env.PAGACUOTAS_INTERNAL_BEARER_TOKEN ??
    process.env.INTERNAL_BEARER_TOKEN ??
    null
  );
}

export function assertInternalApiAuth(request: Request) {
  const expectedApiKey = getExpectedApiKey();
  const expectedBearer = getExpectedBearer();
  // Accept both x-api-key and x-internal-api-key (PagaCuotas sends the latter)
  const apiKey =
    request.headers.get("x-api-key") ?? request.headers.get("x-internal-api-key");
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;

  const apiKeyMatch = Boolean(
    expectedApiKey && apiKey && safeEqual(apiKey, expectedApiKey),
  );
  const bearerMatch = Boolean(
    expectedBearer && bearer && safeEqual(bearer, expectedBearer),
  );

  if (apiKeyMatch || bearerMatch) return;

  throw new Error("No autorizado.");
}

export function unauthorizedResponse() {
  return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
}
