import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkMutationRole } from "@/server/auth/roles";
import { ReportesContablesService } from "@/server/services/contabilidad/reportes-contables.service";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cuenta = await prisma.cuentaBancaria.findUnique({
    where: { id: Number(id) },
    include: { banco: true },
  });
  if (!cuenta) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const svc = new ReportesContablesService(prisma);
  const s = await svc.getSaldoBancario(cuenta.id);
  return NextResponse.json({ ...cuenta, saldo_calculado: s.saldo_calculado, ingresos: s.ingresos, egresos: s.egresos });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await checkMutationRole();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();

  const cuenta = await prisma.$transaction(async (tx) => {
    if (body.cuenta_principal === true) {
      await tx.cuentaBancaria.updateMany({
        where: { cuenta_principal: true, id: { not: Number(id) } },
        data: { cuenta_principal: false },
      });
    }
    return tx.cuentaBancaria.update({
      where: { id: Number(id) },
      data: body,
      include: { banco: true },
    });
  });

  const svc = new ReportesContablesService(prisma);
  const s = await svc.getSaldoBancario(cuenta.id);
  return NextResponse.json({ ...cuenta, saldo_calculado: s.saldo_calculado, ingresos: s.ingresos, egresos: s.egresos });
}
