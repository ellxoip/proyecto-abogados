import { NextResponse } from "next/server";
import { requireSessionUser } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  try {
    await requireSessionUser();
    const { batchId } = await context.params;
    const parsedId = Number(batchId);

    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return NextResponse.json({ ok: false, error: "batchId invalido." }, { status: 400 });
    }

    const [batch, contractsDone, contractsTotal, clientsDone, clientsTotal] = await Promise.all([
      prisma.clientImportBatch.findUnique({
        where: { id: parsedId },
        select: { status: true },
      }),
      prisma.contractImportItem.count({
        where: {
          batch_id: parsedId,
          status: { notIn: ["READY", "REVIEW"] },
        },
      }),
      prisma.contractImportItem.count({ where: { batch_id: parsedId } }),
      prisma.clientImportItem.count({
        where: {
          batch_id: parsedId,
          status: { notIn: ["READY", "REVIEW"] },
        },
      }),
      prisma.clientImportItem.count({ where: { batch_id: parsedId } }),
    ]);

    if (!batch) {
      return NextResponse.json({ ok: false, error: "Batch no encontrado." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      batchStatus: batch.status,
      contractsDone,
      contractsTotal,
      clientsDone,
      clientsTotal,
      done: batch.status === "CONFIRMED" || batch.status === "FAILED",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    const status = message.toLowerCase().includes("autoriz") ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
