import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const { estado } = body;
  const data: Record<string, unknown> = { estado };
  if (estado === "PAGADA") data.fecha_pago = new Date();
  const cxp = await prisma.cuentaPorPagar.update({ where: { id: Number(id) }, data });
  return NextResponse.json(cxp);
}
