import { NextResponse } from "next/server";
import { Role } from "@/lib/db-enums";
import { withSystemRls } from "@/lib/rls";
import { ingestCase } from "@/lib/services/ingestion";

/**
 * POST /api/casos
 * Endpoint de ingesta desde el CRM (validado por Dante).
 *
 * Body (objeto o array):
 *   { client_id: string, code: string, is_paid?: boolean, category?: string }
 *
 *   - `category` es el NOMBRE de la categoría (ej: "TRIBUTARIO"); se resuelve
 *     contra la tabla `categories` (se crea si no existe).
 *   - El caso se marca con `metadata.source = "CRM_DANTE"` para que la Bandeja
 *     muestre el sello de confianza.
 *   - `ingestCase` decide stage según `is_paid` (OPEN si pagado, WAITING_CUOTAS si no).
 */
export async function POST(req: Request) {
  try {
    const expected = process.env.CRM_INGEST_SECRET;
    if (!expected) {
      return NextResponse.json({ success: false, error: "CRM_INGEST_SECRET no configurado" }, { status: 500 });
    }
    if (req.headers.get("x-crm-secret") !== expected) {
      return NextResponse.json({ success: false, error: "Secret inválido o faltante" }, { status: 401 });
    }

    const body = await req.json();
    const inputs = Array.isArray(body) ? body : [body];

    const results = [];
    for (const data of inputs) {
      const { client_id, code, is_paid, category } = data;

      if (!client_id || !code) {
        results.push({ success: false, code, error: "client_id y code son obligatorios" });
        continue;
      }

      const kase = await withSystemRls(async (tx) => {
        let categoryId: string | null = null;
        if (category) {
          const cat = await tx.category.upsert({
            where: { name: category },
            update: {},
            create: { name: category },
          });
          categoryId = cat.id;
        }

        const client = await tx.user.findUnique({
          where: { id: client_id },
          select: { id: true, role: true, active: true },
        });
        if (!client || client.role !== Role.CLIENTE) {
          throw new Error("client_id no corresponde a un cliente valido");
        }

        return tx.case.create({
          data: {
            client_id,
            code,
            is_paid: is_paid ?? false,
            categoryId,
            metadata: JSON.stringify({ source: "CRM_DANTE", verified_by: "Dante", ingested_at: new Date().toISOString() }),
          },
        });
      });

      // Ingestion service: routes paid → OPEN (sin asignar) / unpaid → WAITING_CUOTAS,
      // y dispara las notificaciones correspondientes (que escriben AuditLog).
      await ingestCase(kase.id);
      results.push({ success: true, caseId: kase.id, code });
    }

    return NextResponse.json({ success: true, count: results.length, processed: results });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
