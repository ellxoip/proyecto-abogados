import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";

export async function GET() {
  const servicios = await prisma.servicio.findMany({
    orderBy: { nombre: "asc" },
  });
  return NextResponse.json(
    servicios.map((s) => ({
      ...s,
      precio_base: s.precio_ref,
      unidad: "servicio",
      afecto_iva: s.tipo_impuesto === "IVA",
    })),
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const { nombre, descripcion, precio_base, unidad, afecto_iva } = body;
  if (!nombre || precio_base === undefined) {
    return NextResponse.json({ error: "Campos requeridos: nombre, precio_base" }, { status: 400 });
  }

  const servicio = await prisma.servicio.create({
    data: {
      nombre,
      descripcion: descripcion ?? null,
      precio_ref: Number(precio_base),
      tipo_impuesto: afecto_iva === false ? "EXENTO" : "IVA",
    },
  });
  return NextResponse.json(
    {
      ...servicio,
      precio_base: servicio.precio_ref,
      unidad: unidad ?? "servicio",
      afecto_iva: servicio.tipo_impuesto === "IVA",
    },
    { status: 201 },
  );
}
