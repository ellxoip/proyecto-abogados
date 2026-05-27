import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";
import { ReportesContablesService } from "@/server/services/contabilidad/reportes-contables.service";
import { EstadoComprobante } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const fecha_desde = sp.get("fecha_desde");
  const fecha_hasta = sp.get("fecha_hasta");
  const cuenta_id = sp.get("cuenta_id");
  const cuenta_codigo = sp.get("cuenta_codigo");
  const tipo_comprobante_id = sp.get("tipo_comprobante_id");
  const estado = (sp.get("estado") ?? "APROBADO") as EstadoComprobante;
  const page = Number(sp.get("page") ?? 1);
  const page_size = Math.min(Number(sp.get("page_size") ?? 50), 200);

  if (!Object.values(EstadoComprobante).includes(estado)) {
    return NextResponse.json({ error: "estado inválido" }, { status: 400 });
  }

  const svc = new ReportesContablesService(prisma);
  try {
    const result = await svc.getLibroDiario({
      fecha_desde: fecha_desde ? new Date(fecha_desde) : undefined,
      fecha_hasta: fecha_hasta ? new Date(fecha_hasta + "T23:59:59") : undefined,
      cuenta_id: cuenta_id ? Number(cuenta_id) : undefined,
      cuenta_codigo: cuenta_codigo ?? undefined,
      tipo_comprobante_id: tipo_comprobante_id ? Number(tipo_comprobante_id) : undefined,
      estado,
      page,
      page_size,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
