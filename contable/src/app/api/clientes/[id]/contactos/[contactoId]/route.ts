import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/server/auth/session";

type Params = { params: Promise<{ id: string; contactoId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  try {
    await requireSessionUser();
    const { contactoId } = await params;
    const id = Number(contactoId);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }
    await prisma.clienteContacto.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
