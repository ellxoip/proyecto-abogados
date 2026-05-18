"use server";

import { withSystemRls } from "@/lib/rls";
import { Role, AuditAction } from "@/lib/db-enums";
import { auth } from "@/lib/auth";

/**
 * Forwards a manually captured intake to the CRM (FastAPI on :8000) so the
 * "agendadoras" pool can take ownership of the commercial flow.
 *
 * AT.Informa stores NO local case after this call — once the CRM accepts
 * the payload, AT.Informa's responsibility ends. Only an audit log entry
 * is kept locally for traceability.
 */
export async function sendCaseToCrmAgendadoras(data: {
  fullName: string;
  email: string;
  phone: string;
  rut: string;
  caseCode: string;
  categoryName: string;
  honorarios?: number;
  cuotaInicial?: number;
  numCuotas?: number;
  isPaid: boolean;
  receiptUrl?: string;
  notes?: string;
}) {
  const session = await auth();
  if (!session) return { ok: false, error: "No autorizado" };
  if (session.user.role !== Role.SUPER_ADMIN) {
    return { ok: false, error: "Solo el SuperAdmin puede derivar casos manuales al CRM." };
  }

  const url = process.env.CRM_URL;
  const secret = process.env.CRM_CALLBACK_SECRET;
  if (!url || !secret) {
    return { ok: false, error: "CRM_URL/CRM_CALLBACK_SECRET no configurados en el servidor." };
  }
  if (!data.rut?.trim()) {
    return { ok: false, error: "El RUT del cliente es obligatorio para derivar al CRM." };
  }
  if (!data.fullName?.trim() || !data.phone?.trim()) {
    return { ok: false, error: "Nombre y teléfono del cliente son obligatorios." };
  }

  const payload = {
    fullName: data.fullName.trim(),
    rut: data.rut.trim(),
    email: data.email?.trim() || null,
    phone: data.phone.trim(),
    caseCode: data.caseCode,
    categoryName: data.categoryName,
    honorarios: Number(data.honorarios ?? 0),
    cuotaInicial: Number(data.cuotaInicial ?? 0),
    numCuotas: Number(data.numCuotas ?? 0),
    isPaid: data.isPaid,
    receiptUrl: data.receiptUrl ?? null,
    notes: data.notes ?? null,
    source: "at_informa_manual_intake",
  };

  let responseStatus = 0;
  let responseBody: any = null;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/api/at_informa/manual_intake`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-crm-callback-secret": secret,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    responseStatus = res.status;
    try {
      responseBody = await res.json();
    } catch {
      responseBody = { ok: res.ok };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: responseBody?.detail ?? responseBody?.error ?? `CRM rechazó la solicitud (HTTP ${res.status}).`,
      };
    }
  } catch (err) {
    return {
      ok: false,
      error: `No se pudo conectar al CRM: ${(err as Error).message}`,
    };
  }

  await withSystemRls(async (tx) => {
    await tx.auditLog.create({
      data: {
        action: AuditAction.CASE_DERIVED,
        actorId: session.user.id,
        channel: "system",
        template: "crm_manual_intake",
        status: "ok",
        message: `Caso ${data.caseCode} (cliente ${data.fullName}) derivado al CRM — área de agendadoras.`,
        metadata: JSON.stringify({
          target: "CRM_AT",
          payload,
          responseStatus,
          responseBody,
        }),
      },
    });
  });

  return {
    ok: true,
    crmLeadId: responseBody?.leadId,
    crmAreaName: responseBody?.areaName,
    crmAgendadoraName: responseBody?.agendadoraName,
  };
}
