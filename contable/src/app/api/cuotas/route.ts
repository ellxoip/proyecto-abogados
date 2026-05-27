import { NextResponse } from "next/server";
import { getCuotasOverview } from "@/server/services/cuotas.service";

export async function GET() {
  try {
    const payload = await getCuotasOverview();
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
