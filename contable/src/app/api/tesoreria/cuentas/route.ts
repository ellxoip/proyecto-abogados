import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkMutationRole } from "@/server/auth/roles";
import { ReportesContablesService } from "@/server/services/contabilidad/reportes-contables.service";

export async function GET() {
  const cuentas = await prisma.cuentaBancaria.findMany({
    include: { banco: true },
    orderBy: [{ banco: { nombre: "asc" } }, { nombre: "asc" }],
  });

  const svc = new ReportesContablesService(prisma);
  const withSaldo = await Promise.all(
    cuentas.map(async (c) => {
      const s = await svc.getSaldoBancario(c.id);
      return { ...c, saldo_calculado: s.saldo_calculado, ingresos: s.ingresos, egresos: s.egresos };
    }),
  );

  return NextResponse.json(withSaldo);
}

export async function POST(req: NextRequest) {
  const { error } = await checkMutationRole();
  if (error) return error;

  const body = await req.json();
  const { banco_id, nombre, numero_cuenta, tipo_cuenta, moneda, saldo_inicial, cuenta_principal } = body;
  if (!banco_id || !nombre || !numero_cuenta || !tipo_cuenta) {
    return NextResponse.json({ error: "Campos requeridos: banco_id, nombre, numero_cuenta, tipo_cuenta" }, { status: 400 });
  }

  const cuenta = await prisma.$transaction(async (tx) => {
    if (cuenta_principal === true) {
      await tx.cuentaBancaria.updateMany({
        where: { cuenta_principal: true },
        data: { cuenta_principal: false },
      });
    }
    return tx.cuentaBancaria.create({
      data: {
        banco_id: Number(banco_id),
        nombre,
        numero_cuenta,
        tipo_cuenta,
        moneda: moneda ?? "CLP",
        saldo_inicial: saldo_inicial ?? 0,
        cuenta_principal: cuenta_principal ?? false,
      },
      include: { banco: true },
    });
  });

  const svc = new ReportesContablesService(prisma);
  const s = await svc.getSaldoBancario(cuenta.id);
  return NextResponse.json({ ...cuenta, saldo_calculado: s.saldo_calculado, ingresos: 0, egresos: 0 }, { status: 201 });
}
