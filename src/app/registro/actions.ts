"use server";

import bcrypt from "bcryptjs";
import { CaseStage, Role, AuditAction } from "@/lib/db-enums";
import { withSystemRls } from "@/lib/rls";
import { logAudit } from "@/lib/audit";
import { ingestCase } from "@/lib/services/ingestion";

export type RegisterInput = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  categoryId: string;
  description: string;
};

export type RegisterResult =
  | { ok: true; email: string; caseCode: string }
  | { ok: false; reason: string; field?: keyof RegisterInput };

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RX = /^\+?\d{8,15}$/;

/**
 * Diagrama: "Customer Login (Registration) -> Assessment Request (Landing)".
 *
 * Crea atómicamente la cuenta del Cliente y su primer Caso, dispara la
 * "Carga AUTOMÁTICA de Boleta" vía ingestCase, y deja el caso en la
 * Bandeja del SuperAdmin para la decisión "¿Pago Inicial validado?".
 *
 * Idempotente respecto a duplicados: rechaza si el email ya pertenece a un
 * usuario (no se reutiliza la fila para no mezclar funnels). Si la cuenta
 * existe pero está inactiva (cancelada por Mora Mes 3), bloquea el alta y
 * deriva al cliente al estudio.
 */
export async function registerAndOpenCase(input: RegisterInput): Promise<RegisterResult> {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  const password = input.password;
  const categoryId = input.categoryId;
  const description = input.description.trim();

  if (fullName.length < 3) return { ok: false, reason: "Nombre demasiado corto", field: "fullName" };
  if (!EMAIL_RX.test(email)) return { ok: false, reason: "Email inválido", field: "email" };
  if (!PHONE_RX.test(phone)) return { ok: false, reason: "Teléfono inválido (8-15 dígitos)", field: "phone" };
  if (password.length < 8) return { ok: false, reason: "La contraseña debe tener al menos 8 caracteres", field: "password" };
  if (!categoryId) return { ok: false, reason: "Selecciona una materia legal", field: "categoryId" };
  if (description.length < 20) return { ok: false, reason: "Describe brevemente tu caso (mín. 20 caracteres)", field: "description" };
  if (description.length > 2000) return { ok: false, reason: "Descripción demasiado extensa (máx. 2000 caracteres)", field: "description" };

  const result = await withSystemRls(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { email },
      select: { id: true, role: true, active: true },
    });
    if (existing) {
      if (!existing.active) {
        return { ok: false as const, reason: "Tu cuenta fue suspendida. Contacta al estudio para reactivarla." };
      }
      if (existing.role !== Role.CLIENTE) {
        return { ok: false as const, reason: "Este correo pertenece a un usuario interno. Usa el acceso del equipo.", field: "email" as const };
      }
      return { ok: false as const, reason: "Ya existe una cuenta con este email. Inicia sesión para abrir un nuevo caso.", field: "email" as const };
    }

    const category = await tx.category.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!category) return { ok: false as const, reason: "Materia legal inválida", field: "categoryId" as const };

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await tx.user.create({
      data: {
        fullName,
        email,
        phone,
        passwordHash,
        role: Role.CLIENTE,
        active: true,
      },
      select: { id: true },
    });

    const caseCode = generateCaseCode();
    const kase = await tx.case.create({
      data: {
        code: caseCode,
        client_id: user.id,
        categoryId: category.id,
        stage: CaseStage.OPEN,
        is_paid: false,
        metadata: JSON.stringify({ initialDescription: description, source: "public_registration" }),
      },
      select: { id: true, code: true },
    });

    await tx.comment.create({
      data: {
        caseId: kase.id,
        authorId: user.id,
        body: description,
        type: "PUBLIC",
      },
    });

    await logAudit({
      tx,
      action: AuditAction.CASE_DERIVED,
      caseId: kase.id,
      actorId: user.id,
      message: "Solicitud de asesoría enviada desde el landing público.",
      metadata: { source: "public_registration" },
    });

    return { ok: true as const, userId: user.id, caseId: kase.id, caseCode: kase.code };
  });

  if (!result.ok) return result;

  // Carga AUTOMÁTICA de Boleta (tarea de sistema): ingestCase mueve el caso
  // a WAITING_CUOTAS y dispara la notificación inicial de cobro.
  await ingestCase(result.caseId);

  return { ok: true, email, caseCode: result.caseCode };
}

function generateCaseCode(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `AT-${ymd}-${rand}`;
}
