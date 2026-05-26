import type { PrismaClient } from "@prisma/client";

type PrismaLike = { impuesto: PrismaClient["impuesto"] };

export const TIPO_IVA = "IVA";
export const TIPO_RETENCION_HONORARIOS = "RETENCION_HONORARIOS";

export async function getTasaImpuesto(
  tipo: string,
  db: PrismaLike,
  empresa_id?: number | null,
  fallback?: number,
): Promise<number> {
  const imp = await db.impuesto.findFirst({
    where: {
      tipo,
      activo: true,
      ...(empresa_id != null ? { empresa_id } : {}),
    },
    orderBy: { id: "desc" },
  });
  if (imp) return Number(imp.tasa);
  if (fallback !== undefined) return fallback;
  throw new Error(`Impuesto tipo "${tipo}" no configurado`);
}
