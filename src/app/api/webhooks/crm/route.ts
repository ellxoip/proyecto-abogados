import { NextResponse } from "next/server";

/**
 * DEPRECATED — POST /api/webhooks/crm
 *
 * Endpoint legacy del onboarding directo desde Dante. Reemplazado por
 * el flujo nexio → hive-financial-control → /api/internal/integration/cases.
 *
 * Devuelve 410 Gone para que cualquier integración aún apuntada acá
 * falle ruidosamente y migre al endpoint nuevo.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Endpoint deprecado.",
      migration: "Use POST /api/internal/integration/cases (llamado por hive-financial-control tras confirmar el pago en pagacuotas).",
    },
    { status: 410 },
  );
}
