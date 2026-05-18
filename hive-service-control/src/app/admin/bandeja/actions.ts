"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withRls, withSystemRls } from "@/lib/rls";
import { AuditAction, CaseStage, Role } from "@/lib/db-enums";

function staffCaseScope(actorRole: Role, actorId: string) {
  if (actorRole === Role.SUPER_ADMIN) return {};
  if (actorRole === Role.JEFE_DE_MESA) {
    return {
      OR: [
        { jefe_mesa_id: actorId },
        { abogados: { some: { managedById: actorId } } },
      ],
    };
  }
  return { id: "__none__" };
}

export async function deriveCasesToJefeMesa(caseIds: string[], jefeMesaId: string) {
  const session = await auth();
  if (!session) throw new Error("unauthenticated");
  const actorId = session.user.id;
  const actorRole = session.user.role;

  if (actorRole !== Role.SUPER_ADMIN) {
    throw new Error("forbidden: only SuperAdmin may derive cases to a Jefe de Grupo");
  }

  await withRls(async (tx) => {
    // Validate all cases
    const cases = await tx.case.findMany({
      where: { id: { in: caseIds }, ...staffCaseScope(actorRole, actorId) },
      select: { id: true, is_paid: true },
    });

    if (cases.length !== caseIds.length) throw new Error("some cases not found");
    if (cases.some(c => !c.is_paid)) throw new Error("Cannot derive: some cases have initial payment not validated.");

    await tx.case.updateMany({
      where: { id: { in: caseIds } },
      data: { jefe_mesa_id: jefeMesaId },
    });
  });

  await withSystemRls(async (tx) => {
    const logs = caseIds.map(caseId => ({
      action: AuditAction.CASE_DERIVED,
      caseId,
      actorId,
      message: `Derived to jefe ${jefeMesaId}`,
    }));
    await tx.auditLog.createMany({ data: logs });
  });

  revalidatePath("/admin/bandeja");
}

export async function assignCasesToAbogados(caseIds: string[], abogadoIds: string[]) {
  const session = await auth();
  if (!session) throw new Error("unauthenticated");
  const actorRole = session.user.role;
  const actorId = session.user.id;

  // Tanto el Jefe de Grupo como el SuperAdmin pueden asignar abogados.
  if (actorRole !== Role.JEFE_DE_MESA && actorRole !== Role.SUPER_ADMIN) {
    throw new Error("forbidden: only Jefe de Grupo or SuperAdmin may assign lawyers");
  }

  await withRls(async (tx) => {
    const cases = await tx.case.findMany({
      where: { id: { in: caseIds }, ...staffCaseScope(actorRole, actorId) },
      select: { id: true, stage: true, is_paid: true, unpaid_months: true, code: true },
    });

    if (cases.length !== caseIds.length) throw new Error("some cases not found");
    if (cases.some(c => !c.is_paid)) throw new Error("Cannot assign: some cases have initial payment not validated.");
    const blocked = cases.filter(c => (c.unpaid_months ?? 0) >= 3);
    if (blocked.length > 0) {
      throw new Error(
        `No se puede asignar: ${blocked.length} caso(s) con 3 o más cuotas vencidas (${blocked.map(c => c.code).join(", ")}). Regulariza el pago en Gestión de Mora primero.`,
      );
    }

    const validLawyers = await tx.user.findMany({
      where:
        actorRole === Role.SUPER_ADMIN
          ? { id: { in: abogadoIds }, role: Role.ABOGADO, active: true }
          : { id: { in: abogadoIds }, role: Role.ABOGADO, active: true, managedById: actorId },
      select: { id: true },
    });

    if (validLawyers.length !== abogadoIds.length) {
      throw new Error("Cannot assign: selected lawyers are not valid for your team.");
    }

    // Prisma updateMany doesn't support nested connects (set: abogadoIds).
    // So we loop. (It's safe since this is just a few cases at most).
    for (const kase of cases) {
      await tx.case.update({
        where: { id: kase.id },
        data: {
          abogados: {
            set: abogadoIds.map(id => ({ id }))
          },
          stage: kase.stage === CaseStage.OPEN ? CaseStage.IN_PROGRESS : kase.stage,
        },
      });
    }
  });

  await withSystemRls(async (tx) => {
    const logs = caseIds.map(caseId => ({
      action: AuditAction.CASE_ASSIGNED,
      caseId,
      actorId,
      message: `Assigned to lawyers: ${abogadoIds.join(", ")}`,
    }));
    await tx.auditLog.createMany({ data: logs });
  });

  revalidatePath("/admin/bandeja");
}
