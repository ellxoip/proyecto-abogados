"use server";

import { withSystemRls } from "@/lib/rls";
import { Role, CaseStage } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { enqueueWhatsApp, enqueueEmail } from "@/lib/notifications";
import { generateClientPassword } from "@/lib/services/crm-onboarding";
import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function quickIntake(data: {
  fullName: string;
  email: string;
  phone: string;
  caseCode: string;
  categoryId: string;
  isPaid: boolean;
  receiptUrl?: string;
}) {
  const session = await auth();
  if (!session) return { ok: false, error: "No autorizado" };
  if (session.user.role !== Role.SUPER_ADMIN && session.user.role !== Role.JEFE_DE_MESA) {
    return { ok: false, error: "Solo SuperAdmin o Jefe de Mesa pueden ingresar casos." };
  }

  return await withSystemRls(async (tx) => {
    // 1. Find or Create Client with REAL credentials
    let client = await tx.user.findUnique({
      where: { email: data.email }
    });

    const plainPassword = generateClientPassword(data.fullName, data.phone);
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    if (!client) {
      client = await tx.user.create({
        data: {
          fullName: data.fullName,
          email: data.email,
          phone: data.phone,
          role: Role.CLIENTE,
          passwordHash,
          active: true
        }
      });
    } else {
      if (client.role !== Role.CLIENTE) {
        return { ok: false, error: "El email pertenece a un usuario interno. Usa el cliente correcto." };
      }
      // Update credentials for existing client
      await tx.user.update({
        where: { id: client.id },
        data: { passwordHash, active: true }
      });
    }

    // 2. Create Case
    const kase = await tx.case.create({
      data: {
        code: data.caseCode,
        client_id: client.id,
        categoryId: data.categoryId,
        is_paid: data.isPaid,
        initial_invoice: data.receiptUrl,
        stage: data.isPaid ? CaseStage.OPEN : CaseStage.WAITING_CUOTAS,
        jefe_mesa_id: session.user.role === Role.JEFE_DE_MESA ? session.user.id : null,
      }
    });

    // 3. Send private credentials to client
    await Promise.allSettled([
      enqueueWhatsApp({ kind: "client_credentials", caseId: kase.id }),
      enqueueEmail({ kind: "client_credentials", caseId: kase.id }),
    ]);

    revalidatePath("/admin/bandeja");
    return { ok: true, caseId: kase.id };
  });
}
