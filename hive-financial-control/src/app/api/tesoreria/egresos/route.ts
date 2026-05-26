import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkMutationRole } from "@/server/auth/roles";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const estado = sp.get("estado");
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");

  const egresos = await prisma.egresoTesoreria.findMany({
    where: {
      ...(estado ? { estado: estado as "PENDIENTE" | "APROBADO" | "PAGADO" | "RECHAZADO" } : {}),
      ...(desde || hasta ? {
        fecha_egreso: {
          ...(desde ? { gte: new Date(desde) } : {}),
          ...(hasta ? { lte: new Date(hasta + "T23:59:59") } : {}),
        },
      } : {}),
    },
    include: {
      cuenta: { include: { banco: true } },
      proveedor: { select: { id: true, nombre: true, rut: true } },
    },
    orderBy: [{ estado: "asc" }, { fecha_vencimiento: "asc" }],
    take: 500,
  });
  return NextResponse.json(egresos);
}

export async function POST(req: NextRequest) {
  const { error: authError } = await checkMutationRole();
  if (authError) return authError;

  const body = await req.json();
  const { cuenta_id, proveedor_id, categoria, descripcion, monto, fecha_egreso, fecha_vencimiento, recurrente } = body;
  if (!cuenta_id || !categoria || !descripcion || !monto || !fecha_egreso) {
    return NextResponse.json({ error: "Campos requeridos: cuenta_id, categoria, descripcion, monto, fecha_egreso" }, { status: 400 });
  }

  const egreso = await prisma.egresoTesoreria.create({
    data: {
      cuenta_id: Number(cuenta_id),
      proveedor_id: proveedor_id ? Number(proveedor_id) : undefined,
      categoria,
      descripcion,
      monto: Number(monto),
      fecha_egreso: new Date(fecha_egreso),
      fecha_vencimiento: fecha_vencimiento ? new Date(fecha_vencimiento) : undefined,
      recurrente: recurrente ?? false,
    },
    include: { cuenta: { include: { banco: true } }, proveedor: true },
  });
  return NextResponse.json(egreso, { status: 201 });
}
