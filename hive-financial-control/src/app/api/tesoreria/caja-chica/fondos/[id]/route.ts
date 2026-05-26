import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { nombre, monto_asignado, responsable_id, descripcion, activo } = body;

  const data: Record<string, unknown> = {};
  if (nombre !== undefined) data.nombre = nombre;
  if (responsable_id !== undefined) data.responsable_id = Number(responsable_id);
  if (descripcion !== undefined) data.descripcion = descripcion;
  if (activo !== undefined) data.activo = activo;
  if (monto_asignado !== undefined) {
    const fondo = await prisma.fondoCajaChica.findUnique({ where: { id: Number(id) } });
    if (fondo) {
      const diff = Number(monto_asignado) - Number(fondo.monto_asignado);
      data.monto_asignado = Number(monto_asignado);
      data.saldo_actual = Math.max(0, Number(fondo.saldo_actual) + diff);
    }
  }

  const fondo = await prisma.fondoCajaChica.update({
    where: { id: Number(id) },
    data,
    include: { responsable: { select: { id: true, nombre: true } } },
  });
  return NextResponse.json(fondo);
}
