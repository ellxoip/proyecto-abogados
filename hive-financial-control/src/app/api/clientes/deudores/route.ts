import { NextRequest, NextResponse } from "next/server";
import { getDeudoresOverview } from "@/server/services/cobranza.service";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const payload = await getDeudoresOverview({
      q: sp.get("q") ?? undefined,
      estadoCobranza: (sp.get("estadoCobranza") as never) ?? undefined,
      soloConCuotasVencidas: sp.get("vencidas") === "1",
      minMonto: sp.get("minMonto") ? Number(sp.get("minMonto")) : undefined,
      maxMonto: sp.get("maxMonto") ? Number(sp.get("maxMonto")) : undefined,
      minDiasAtraso: sp.get("minDias") ? Number(sp.get("minDias")) : undefined,
      maxDiasAtraso: sp.get("maxDias") ? Number(sp.get("maxDias")) : undefined,
      compromisoActivo: sp.get("compromisoActivo") === "1",
      compromisoIncumplido: sp.get("compromisoIncumplido") === "1",
    });
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
