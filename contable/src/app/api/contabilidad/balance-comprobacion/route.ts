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
  const estado = (sp.get("estado") ?? "APROBADO") as EstadoComprobante;
  const nivel = sp.get("nivel") ? Number(sp.get("nivel")) : undefined;
  const incluir_cuentas_sin_movimiento = sp.get("incluir_cuentas_sin_movimiento") === "true";

  if (!Object.values(EstadoComprobante).includes(estado)) {
    return NextResponse.json({ error: "estado inválido" }, { status: 400 });
  }

  const svc = new ReportesContablesService(prisma);
  try {
    const result = await svc.getBalanceComprobacion({
      fecha_desde: fecha_desde ? new Date(fecha_desde) : undefined,
      fecha_hasta: fecha_hasta ? new Date(fecha_hasta + "T23:59:59") : undefined,
      estado,
      nivel,
      incluir_cuentas_sin_movimiento,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
