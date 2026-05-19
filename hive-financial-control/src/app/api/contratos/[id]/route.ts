import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/server/auth/session";
import { EstadoContrato } from "@prisma/client";

const patchContratoSchema = z.object({
  tipo_servicio: z.string().min(1).max(200).optional(),
  fecha_contrato: z.string().min(1).optional(),
  monto_ccto: z.number().positive().optional(),
  cantidad_cuotas_original: z.number().int().min(1).optional(),
  observaciones: z.string().max(2000).optional().nullable(),
  estado: z.nativeEnum(EstadoContrato).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireSessionUser();
    const { id } = await params;
    const contratoId = Number(id);
    if (!Number.isFinite(contratoId) || contratoId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json();
    const data = patchContratoSchema.parse(body);

    const contrato = await prisma.contrato.update({
      where: { id: contratoId },
      data: {
        ...(data.tipo_servicio !== undefined && { tipo_servicio: data.tipo_servicio }),
        ...(data.fecha_contrato !== undefined && { fecha_contrato: new Date(data.fecha_contrato) }),
        ...(data.monto_ccto !== undefined && { monto_ccto: data.monto_ccto }),
        ...(data.cantidad_cuotas_original !== undefined && { cantidad_cuotas_original: data.cantidad_cuotas_original }),
        ...(data.observaciones !== undefined && { observaciones: data.observaciones }),
        ...(data.estado !== undefined && { estado: data.estado }),
      },
    });

    return NextResponse.json({ ok: true, id: contrato.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    const msg = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireSessionUser();
    const { id } = await params;
    const contratoId = Number(id);
    if (!Number.isFinite(contratoId) || contratoId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const contrato = await prisma.contrato.findUnique({
      where: { id: contratoId },
      select: {
        id: true,
        tipo_servicio: true,
        fecha_contrato: true,
        monto_ccto: true,
        observaciones: true,
        estado: true,
        external_id: true,
      },
    });

    if (!contrato) {
      return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
    }

    return NextResponse.json(contrato);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
