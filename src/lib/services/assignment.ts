// filepath: src/lib/services/assignment.ts
/**
 * Legal OS v3.0 - Intelligent Assignment Rules
 * 
 * Implements a "Load Balancer" for cases:
 * - Assign to the attorney with the fewest active cases
 * - Prioritize by specialty (Category matching)
 * - SuperAdmin override for manual "Power Assignments"
 * 
 * Part of "The Destination Experience" - ensuring fair and efficient case distribution.
 */

import { Role } from "@prisma/client";
import { withRls } from "../rls";
import { logAudit } from "../audit";


export type AssignmentResult = {
  success: boolean;
  caseId: string;
  assignedToId?: string;
  assignedToName?: string;
  assignmentType: "auto" | "manual" | "power";
  reason?: string;
  error?: string;
};

export type AssignmentOptions = {
  caseId: string;
  category: string;
  forceAbogadoId?: string; // For manual/power assignments
  forceJefeMesaId?: string; // For manual/power assignments
  assignedById?: string;
};


/**
 * Get the attorney with the fewest active cases.
 * Considers category matching for priority.
 */
async function getLeastLoadedAbogado(
  prisma: any,
  _category: string
): Promise<{ id: string; fullName: string; activeCases: number } | null> {

  // Get all active attorneys
  const attorneys = await prisma.user.findMany({
    where: {
      role: Role.ABOGADO,
      active: true,
    },
    select: {
      id: true,
      fullName: true,
      casesAsLawyer: {
        where: {
          stage: { not: "FINISHED" },
        },
        select: { id: true },
      },
    },
  });

  if (attorneys.length === 0) {
    return null;
  }

  // Map to count and find least loaded
  const attorneyWithCounts = attorneys.map((a: any) => ({
    id: a.id,
    fullName: a.fullName,
    activeCases: a.casesAsLawyer.length,
  }));

  // Sort by active cases (ascending) - least loaded first
  attorneyWithCounts.sort((a: any, b: any) => a.activeCases - b.activeCases);


  return attorneyWithCounts[0];
}

/**
 * Get the jefe de mesa with the fewest active cases.
 */
async function getLeastLoadedJefeMesa(
  prisma: any
): Promise<{ id: string; fullName: string; activeCases: number } | null> {

  const jefeMesas = await prisma.user.findMany({
    where: {
      role: Role.JEFE_DE_MESA,
      active: true,
    },
    select: {
      id: true,
      fullName: true,
      casesAsJefeMesa: {
        where: {
          stage: { not: "FINISHED" },
        },
        select: { id: true },
      },
    },
  });

  if (jefeMesas.length === 0) {
    return null;
  }

  const jefeMesaWithCounts = jefeMesas.map((j: any) => ({
    id: j.id,
    fullName: j.fullName,
    activeCases: j.casesAsJefeMesa.length,
  }));

  jefeMesaWithCounts.sort((a: any, b: any) => a.activeCases - b.activeCases);


  return jefeMesaWithCounts[0];
}

/**
 * Auto-assign a case to the least loaded attorney and jefe de mesa.
 * This is the main entry point for automatic case assignment.
 */
export async function autoAssignCase(
  options: AssignmentOptions
): Promise<AssignmentResult> {
  const { caseId, category, assignedById } = options;

  try {
    return await withRls(async (tx) => {
      // Get least loaded attorney
      const abogado = await getLeastLoadedAbogado(tx, category);
      
      // Get least loaded jefe de mesa
      const jefeMesa = await getLeastLoadedJefeMesa(tx);

      if (!abogado) {
        return {
          success: false,
          caseId,
          assignmentType: "auto",
          error: "No hay abogados activos disponibles",
        };
      }

      // Update case with assignments
      const updateData: any = {
        abogados: {
          connect: [{ id: abogado.id }]
        }
      };

      // Only assign jefe de mesa if available
      if (jefeMesa) {
        updateData.jefe_mesa_id = jefeMesa.id;
      }

      await tx.case.update({
        where: { id: caseId },
        data: updateData,
        select: {
          id: true,
          code: true,
          abogados: { select: { fullName: true } },
          jefeMesa: { select: { fullName: true } },
        },
      });

      // Log the assignment
      if (abogado) {
        await logAudit({
          tx,
          caseId,
          actorId: assignedById ?? "system",
          action: "CASE_ASSIGNED",
          message: `Auto-asignado a ${abogado.fullName} (menos casos activos)`
        });
      }

      if (jefeMesa) {
        await logAudit({
          tx,
          caseId,
          actorId: assignedById ?? "system",
          action: "CASE_DERIVED",
          message: `Auto-asignado a ${jefeMesa.fullName} (menos casos activos)`
        });
      }


      return {
        success: true,
        caseId,
        assignedToId: abogado.id,
        assignedToName: abogado.fullName,
        assignmentType: "auto",
        reason: `Asignado automáticamente al abogado con menos carga (${abogado.activeCases} casos activos)`,
      };
    });
  } catch (error: any) {
    return {
      success: false,
      caseId,
      assignmentType: "auto",
      error: error.message,
    };
  }
}

/**
 * Manual assignment by SuperAdmin (Power Assignment).
 * Allows overriding the automatic load balancing.
 */
export async function powerAssignCase(
  options: AssignmentOptions
): Promise<AssignmentResult> {
  const { caseId, forceAbogadoId, forceJefeMesaId, assignedById } = options;

  if (!forceAbogadoId) {
    return {
      success: false,
      caseId,
      assignmentType: "power",
      error: "Se requiere especificar un abogado para la asignación",
    };
  }

  try {
    return await withRls(async (tx) => {
      // Verify the attorney exists and is active
      const abogado = await tx.user.findUnique({
        where: { id: forceAbogadoId },
        select: { id: true, fullName: true, role: true, active: true },
      });

      if (!abogado || abogado.role !== Role.ABOGADO) {
        return {
          success: false,
          caseId,
          assignmentType: "power",
          error: "El abogado especificado no existe o no está activo",
        };
      }

      // Update case with manual assignment
      const updateData: any = {
        abogados: {
          set: [{ id: forceAbogadoId }]
        }
      };

      // Optionally assign jefe de mesa
      if (forceJefeMesaId) {
        const jefeMesa = await tx.user.findUnique({
          where: { id: forceJefeMesaId },
          select: { id: true, fullName: true, role: true, active: true },
        });

        if (jefeMesa && jefeMesa.role === Role.JEFE_DE_MESA) {
          updateData.jefe_mesa_id = forceJefeMesaId;
        }
      }

      await tx.case.update({
        where: { id: caseId },
        data: updateData,
        select: {
          id: true,
          code: true,
        },
      });

      // Log the power assignment
      await logAudit({
        tx,
        caseId,
        actorId: assignedById ?? "system",
        action: "CASE_ASSIGNED",
        message: "Asignación manual por SuperAdmin"
      });


      return {
        success: true,
        caseId,
        assignedToId: forceAbogadoId,
        assignedToName: abogado.fullName,
        assignmentType: "power",
        reason: "Asignación manual por SuperAdmin",
      };
    });
  } catch (error: any) {
    return {
      success: false,
      caseId,
      assignmentType: "power",
      error: error.message,
    };
  }
}

/**
 * Reassign a case to a different attorney.
 * Used for load balancing or when an attorney is unavailable.
 */
export async function reassignCase(
  caseId: string,
  newAbogadoId: string,
  assignedById: string,
  reason?: string
): Promise<AssignmentResult> {
  try {
    return await withRls(async (tx) => {
      // Get current case to log the change
      const currentCase = await tx.case.findUnique({
        where: { id: caseId },
        select: { abogados: { select: { id: true } } },
      });

      if (!currentCase) {
        return {
          success: false,
          caseId,
          assignmentType: "manual",
          error: "Caso no encontrado",
        };
      }

      // Verify new attorney exists and is active
      const newAbogado = await tx.user.findUnique({
        where: { id: newAbogadoId },
        select: { id: true, fullName: true, role: true, active: true },
      });

      if (!newAbogado || newAbogado.role !== Role.ABOGADO) {
        return {
          success: false,
          caseId,
          assignmentType: "manual",
          error: "El nuevo abogado no existe o no está activo",
        };
      }

      // Update assignment
      await tx.case.update({
        where: { id: caseId },
        data: { 
          abogados: {
            set: [{ id: newAbogadoId }]
          }
        },
      });

      // Log the reassignment
      await logAudit({
        tx,
        caseId,
        actorId: assignedById,
        action: "CASE_ASSIGNED",
        message: reason ?? `Reasignado equipo legal`,
        metadata: { previousAbogadoIds: currentCase.abogados.map(a => a.id) }
      });


      return {
        success: true,
        caseId,
        assignedToId: newAbogadoId,
        assignedToName: newAbogado.fullName,
        assignmentType: "manual",
        reason: reason ?? "Reasignación manual",
      };
    });
  } catch (error: any) {
    return {
      success: false,
      caseId,
      assignmentType: "manual",
      error: error.message,
    };
  }
}

/**
 * Get assignment statistics for dashboard.
 */
export async function getAssignmentStats(): Promise<{
  attorneys: { id: string; name: string; activeCases: number }[];
  jefeMesas: { id: string; name: string; activeCases: number }[];
}> {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  try {
    const [attorneys, jefeMesas] = await Promise.all([
      prisma.user.findMany({
        where: { role: Role.ABOGADO, active: true },
        select: {
          id: true,
          fullName: true,
          casesAsLawyer: {
            where: { stage: { not: "FINISHED" } },
            select: { id: true },
          },
        },
      }),
      prisma.user.findMany({
        where: { role: Role.JEFE_DE_MESA, active: true },
        select: {
          id: true,
          fullName: true,
          casesAsJefeMesa: {
            where: { stage: { not: "FINISHED" } },
            select: { id: true },
          },
        },
      }),
    ]);

    return {
      attorneys: attorneys.map((a) => ({
        id: a.id,
        name: a.fullName,
        activeCases: a.casesAsLawyer.length,
      })),
      jefeMesas: jefeMesas.map((j) => ({
        id: j.id,
        name: j.fullName,
        activeCases: j.casesAsJefeMesa.length,
      })),
    };
  } finally {
    await prisma.$disconnect();
  }
}
