import { NextResponse } from "next/server";
import { getContratoCuotasDetalle } from "@/server/services/cuotas.service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ contratoId: string }> },
) {
  try {
    const { contratoId } = await context.params;
    const parsedId = Number(contratoId);

    if (!Number.isFinite(parsedId) || parsedId <= 0) {
      return NextResponse.json({ error: "Contrato invalido" }, { status: 400 });
    }

    const payload = await getContratoCuotasDetalle(parsedId);

    if (!payload) {
      return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
