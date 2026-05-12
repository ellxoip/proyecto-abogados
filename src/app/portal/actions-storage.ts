"use server";

import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { PaymentStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const RECEIPTS_BUCKET = "receipts";
const MAX_RECEIPT_SIZE = 15 * 1024 * 1024;
const ALLOWED_RECEIPT_EXTS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];

async function ensureReceiptsBucket() {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    const { data: bucket } = await admin.storage.getBucket(RECEIPTS_BUCKET);
    if (!bucket) {
      await admin.storage.createBucket(RECEIPTS_BUCKET, {
        public: true,
        fileSizeLimit: MAX_RECEIPT_SIZE,
      });
    }
  } catch (err) {
    console.error("[storage] Bucket receipts:", err);
  }
  return admin;
}

export async function uploadReceipt(caseId: string, formData: FormData) {
  const session = await auth();
  if (!session) return { ok: false, error: "No autenticado" };

  return await withRls(async (tx) => {
    try {
      const kase = await tx.case.findFirst({
        where: { id: caseId, client_id: session.user.id },
        select: { id: true },
      });
      if (!kase) return { ok: false, error: "Caso no encontrado o no autorizado" };

      const file = formData.get("receipt") as File | null;
      if (!file || file.size === 0) {
        return { ok: false, error: "No se proporcionó ningún archivo" };
      }
      if (file.size > MAX_RECEIPT_SIZE) {
        return { ok: false, error: `Archivo demasiado grande (máx. ${MAX_RECEIPT_SIZE / 1024 / 1024} MB).` };
      }
      const fileExt = "." + (file.name.split(".").pop() ?? "").toLowerCase();
      if (!ALLOWED_RECEIPT_EXTS.includes(fileExt)) {
        return { ok: false, error: "Formato no permitido. Subí un PDF o imagen." };
      }

      const admin = await ensureReceiptsBucket();
      if (!admin) {
        return {
          ok: false,
          error: "Almacenamiento no configurado. Contacta al administrador.",
        };
      }

      const fileName = `${caseId}/${Date.now()}_receipt${fileExt}`;
      const { error } = await admin.storage
        .from(RECEIPTS_BUCKET)
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });

      if (error) {
        console.error("[upload-receipt] Storage error:", error);
        return { ok: false, error: `No se pudo subir el comprobante: ${error.message ?? "error desconocido"}` };
      }

      const { data: publicUrlData } = admin.storage.from(RECEIPTS_BUCKET).getPublicUrl(fileName);
      const receiptUrl = publicUrlData.publicUrl;

      // Register the payment event as UNPAID (Pending Validation)
      await tx.paymentEvent.create({
        data: {
          caseId,
          status: PaymentStatus.UNPAID,
          amount: new Prisma.Decimal(0), // Amount unknown until validation
          receipt_url: receiptUrl,
        },
      });

      // We don't automatically reactivate. The Admin must validate it.
      
      revalidatePath("/portal");
      revalidatePath(`/portal/casos/${caseId}`);
      revalidatePath("/admin/mora");

      return { ok: true, receiptUrl };
    } catch (err: any) {
      console.error("Error in uploadReceipt:", err);
      return { ok: false, error: err.message };
    }
  });
}
