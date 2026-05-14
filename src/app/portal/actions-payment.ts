"use server";

import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { supabase } from "@/lib/supabase-client";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { PaymentStatus, AuditAction } from "@/lib/db-enums";
import { logAudit } from "@/lib/audit";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]);
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const RECEIPTS_BUCKET = "receipts";

export type UploadProofResult =
  | { ok: true; message: string }
  | { ok: false; reason: string };

/**
 * Subida del comprobante por parte del cliente desde el portal. Valida tipo
 * y tamaño en el servidor (además del `accept` del input), guarda el archivo
 * en Supabase Storage, lo enlaza como Boleta del caso y registra un
 * PaymentEvent en estado UNPAID para que el SuperAdmin Jorge lo revise en
 * la Bandeja ("¿Pago Inicial validado?"). La transición HALTED -> OPEN solo
 * ocurre cuando el SuperAdmin confirma el pago en `regularizeCase`.
 */
export async function uploadPaymentProof(caseId: string, formData: FormData): Promise<UploadProofResult> {
  const session = await auth();
  if (!session) return { ok: false, reason: "No autenticado" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, reason: "Archivo requerido" };

  if (!ALLOWED_MIME.has(file.type)) {
    return { ok: false, reason: "Solo se aceptan imágenes (JPG, PNG, WEBP, HEIC) o PDF." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, reason: "El archivo supera el tamaño máximo de 8 MB." };
  }
  if (file.size === 0) {
    return { ok: false, reason: "El archivo está vacío." };
  }

  const ext = extensionFor(file.type);
  const path = `${caseId}/${Date.now()}-${crypto.randomUUID()}${ext}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, arrayBuffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("supabase upload failed", uploadError);
    return { ok: false, reason: "No se pudo almacenar el comprobante. Intenta de nuevo." };
  }

  const { data: pub } = supabase.storage.from(RECEIPTS_BUCKET).getPublicUrl(path);
  const receiptUrl = pub.publicUrl;

  const result = await withRls(async (tx) => {
    const kase = await tx.case.findUnique({
      where: { id: caseId },
      select: { id: true, stage: true, client_id: true },
    });
    if (!kase) return { ok: false as const, reason: "Caso no encontrado" };
    if (kase.client_id !== session.user.id) {
      return { ok: false as const, reason: "No autorizado" };
    }

    await tx.case.update({
      where: { id: caseId },
      data: { initial_invoice: receiptUrl },
    });

    await tx.paymentEvent.create({
      data: {
        caseId,
        status: PaymentStatus.UNPAID,
        amount: new Prisma.Decimal(0),
        receipt_url: receiptUrl,
      },
    });

    await logAudit({
      tx,
      action: AuditAction.PAYMENT_RECORDED,
      caseId,
      message: "Cliente subió comprobante de pago — pendiente de revisión.",
      metadata: { receiptUrl, mimeType: file.type, size: file.size },
    });

    return { ok: true as const };
  });

  if (!result.ok) return result;

  revalidatePath(`/portal/casos/${caseId}`);
  revalidatePath("/admin/mora");
  return {
    ok: true,
    message: "Comprobante recibido. Nuestro equipo legal lo está revisando — recibirás una confirmación en cuanto sea validado.",
  };
}

function extensionFor(mime: string): string {
  switch (mime) {
    case "image/jpeg": return ".jpg";
    case "image/png":  return ".png";
    case "image/webp": return ".webp";
    case "image/heic": return ".heic";
    case "application/pdf": return ".pdf";
    default: return "";
  }
}
