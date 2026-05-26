import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkMutationRole } from "@/server/auth/roles";
import { ContabilidadService } from "@/server/services/contabilidad/contabilidad.service";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const comprobante = await prisma.comprobanteContable.findUnique({
    where: { id: Number(id) },
    include: {
      tipo: true,
      partidas: { include: { cuenta: { select: { codigo: true, nombre: true, tipo: true, naturaleza: true } } } },
      usuario: { select: { nombre: true } },
      aprobador: { select: { nombre: true } },
    },
  });
  if (!comprobante) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(comprobante);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error: authError } = await checkMutationRole();
  if (authError) return authError;

  const { id } = await params;
  const { estado, motivo } = await req.json();

  const actual = await prisma.comprobanteContable.findUnique({ where: { id: Number(id) } });
  if (!actual) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const TRANSICIONES_VALIDAS: Record<string, string[]> = {
    BORRADOR: ["APROBADO", "ANULADO"],
    APROBADO: ["ANULADO"],
    ANULADO: [],
  };

  const permitidos = TRANSICIONES_VALIDAS[actual.estado] ?? [];
  if (!permitidos.includes(estado)) {
    return NextResponse.json(
      { error: `Transición no permitida: ${actual.estado} → ${estado}` },
      { status: 422 },
    );
  }

  if (actual.estado === "APROBADO" && estado === "ANULADO") {
    const svc = new ContabilidadService(prisma);
    try {
      const contraasiento = await svc.anularComprobanteConContraasiento(
        Number(id),
        motivo ?? "Anulado manualmente",
        Number(session.userId),
      );
      return NextResponse.json(contraasiento);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 422 });
    }
  }

  const data: Record<string, unknown> = { estado };
  if (estado === "APROBADO") data.aprobado_por = Number(session.userId);

  const comprobante = await prisma.comprobanteContable.update({ where: { id: Number(id) }, data });
  return NextResponse.json(comprobante);
}
