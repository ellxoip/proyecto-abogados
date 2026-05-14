/**
 * Legal OS v3.0 - API de Casos de Prueba
 *
 * Endpoints para crear y gestionar casos de prueba sin ejecutar el seed.
 *
 *   POST   /api/casos/test                  → crear/actualizar caso(s)
 *   GET    /api/casos/test                  → listar casos de prueba
 *   DELETE /api/casos/test?code=AT-TEST-001 → eliminar caso
 */

import { NextResponse } from "next/server";
import { withSystemRls } from "@/lib/rls";
import { CaseStage } from "@/lib/db-enums";
import { enqueueWhatsApp } from "@/lib/notifications";

type TestCaseInput = {
  code: string;
  client_id?: string;
  client_email?: string;
  category: string;            // Nombre de la categoría (ej: "TRIBUTARIO")
  stage?: CaseStage;
  is_paid?: boolean;
  simulate_mora?: boolean;
  simulate_cuotas?: boolean;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const inputs: TestCaseInput[] = Array.isArray(body) ? body : [body];

    const results = await withSystemRls(async (tx) => {
      const out: any[] = [];

      for (const input of inputs) {
        const {
          code,
          client_id,
          client_email,
          category,
          stage = CaseStage.OPEN,
          is_paid = false,
          simulate_mora = false,
          simulate_cuotas = false,
        } = input;

        // Resolver client_id desde email
        let resolvedClientId = client_id;
        if (!resolvedClientId && client_email) {
          const u = await tx.user.findUnique({ where: { email: client_email }, select: { id: true } });
          if (!u) {
            out.push({ success: false, code, error: `Cliente no encontrado: ${client_email}` });
            continue;
          }
          resolvedClientId = u.id;
        }
        if (!resolvedClientId) {
          out.push({ success: false, code, error: "Se requiere client_id o client_email" });
          continue;
        }

        // Resolver category (upsert si no existe)
        const cat = await tx.category.upsert({
          where: { name: category },
          update: {},
          create: { name: category },
        });

        // Determinar stage final según flags de simulación
        let finalStage = stage;
        let halted_at: Date | null = null;
        let halted_reason: string | null = null;
        if (simulate_mora) {
          finalStage = CaseStage.HALTED_BY_PAYMENT;
          halted_at = new Date();
          halted_reason = "Prueba de mora — simulación activada";
        } else if (simulate_cuotas) {
          finalStage = CaseStage.WAITING_CUOTAS;
          halted_at = new Date();
          halted_reason = "Esperando validación de Sistema de Cuotas";
        }

        const data = {
          code,
          client_id: resolvedClientId,
          categoryId: cat.id,
          stage: finalStage,
          is_paid,
          halted_at,
          halted_reason,
        };

        const kase = await tx.case.upsert({ where: { code }, update: data, create: data });

        out.push({
          success: true,
          caseId: kase.id,
          code: kase.code,
          stage: finalStage,
          is_paid,
        });

        if (simulate_mora) {
          await enqueueWhatsApp({ kind: "overdue_notice", caseId: kase.id });
        }
      }

      return out;
    });

    return NextResponse.json({ success: true, count: results.length, processed: results });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}

export async function GET() {
  try {
    const cases = await withSystemRls((tx) =>
      tx.case.findMany({
        where: { code: { startsWith: "AT-TEST-" } },
        select: {
          id: true,
          code: true,
          stage: true,
          is_paid: true,
          categoria: { select: { name: true } },

          createdAt: true,
          client: { select: { fullName: true, email: true } },
          abogados: { select: { fullName: true } },

        },
        orderBy: { createdAt: "desc" },
      }),
    );
    return NextResponse.json({ success: true, count: cases.length, cases });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  if (!code) {
    return NextResponse.json({ success: false, error: "Se requiere el parámetro 'code'" }, { status: 400 });
  }
  try {
    await withSystemRls((tx) => tx.case.delete({ where: { code } }));
    return NextResponse.json({ success: true, message: `Caso ${code} eliminado` });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
