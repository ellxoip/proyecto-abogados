import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/server/auth/session";

export async function GET() {
  const config = await prisma.configEmpresa.findFirst();
  return NextResponse.json(config ?? {});
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const existing = await prisma.configEmpresa.findFirst();

  if (existing) {
    const config = await prisma.configEmpresa.update({ where: { id: existing.id }, data: body });
    return NextResponse.json(config);
  } else {
    const config = await prisma.configEmpresa.create({ data: body });
    return NextResponse.json(config, { status: 201 });
  }
}
