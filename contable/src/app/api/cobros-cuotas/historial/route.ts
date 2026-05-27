import { NextRequest, NextResponse } from "next/server";
import { getCobrosHistorial } from "@/server/services/cobranza.service";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const payload = await getCobrosHistorial({
      q: sp.get("q") ?? undefined,
      tipoEvento: sp.get("tipoEvento") ?? undefined,
      entidad: sp.get("entidad") ?? undefined,
      usuario: sp.get("usuario") ?? undefined,
      origen: sp.get("origen") ?? undefined,
      desde: sp.get("desde") ?? undefined,
      hasta: sp.get("hasta") ?? undefined,
      soloErrores: sp.get("soloErrores") === "1",
      soloPagos: sp.get("soloPagos") === "1",
      soloGestiones: sp.get("soloGestiones") === "1",
      soloImportaciones: sp.get("soloImportaciones") === "1",
      page: sp.get("page") ? Number(sp.get("page")) : undefined,
      pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : undefined,
    });
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
