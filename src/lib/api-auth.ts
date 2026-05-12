import { NextRequest, NextResponse } from "next/server";

/**
 * Valida el Bearer token para acceso a la API externa (/api/v1/*).
 * El token debe coincidir con la variable de entorno EXTERNAL_API_KEY.
 *
 * Uso:
 *   const err = requireApiKey(req);
 *   if (err) return err;
 */
export function requireApiKey(req: NextRequest): NextResponse | null {
  const expectedKey = process.env.EXTERNAL_API_KEY;

  if (!expectedKey) {
    return NextResponse.json(
      { success: false, error: "EXTERNAL_API_KEY no está configurada en el servidor." },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token || token !== expectedKey) {
    return NextResponse.json(
      { success: false, error: "API Key inválida o faltante." },
      { status: 401 }
    );
  }

  return null; // OK
}
