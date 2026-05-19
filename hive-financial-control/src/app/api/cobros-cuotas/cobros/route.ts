import { NextRequest, NextResponse } from "next/server";
import { getCobrosOverview } from "@/server/services/cobranza.service";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const payload = await getCobrosOverview({
      q: sp.get("q") ?? undefined,
      estadoCuota: sp.get("estadoCuota") ?? undefined,
      estadoCobranza: (sp.get("estadoCobranza") as never) ?? undefined,
      vencidas: sp.get("vencidas") === "1",
      proximas: sp.get("proximas") === "1",
      compromisoActivo: sp.get("compromisoActivo") === "1",
      sinGestion: sp.get("sinGestion") === "1",
      minMonto: sp.get("minMonto") ? Number(sp.get("minMonto")) : undefined,
      maxMonto: sp.get("maxMonto") ? Number(sp.get("maxMonto")) : undefined,
      desde: sp.get("desde") ?? undefined,
      hasta: sp.get("hasta") ?? undefined,
    });
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
