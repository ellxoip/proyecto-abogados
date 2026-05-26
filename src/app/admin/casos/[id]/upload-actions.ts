"use server";

import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { CaseStage, Role } from "@/lib/db-enums";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { revalidatePath, revalidateTag } from "next/cache";
import { assertCaseActive } from "@/lib/case-health";
import { enqueueWhatsApp, enqueueEmail } from "@/lib/notifications";
import fs from "fs";
import path from "path";

const STORAGE_BUCKET = "documents";
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".doc", ".docx", ".xls", ".xlsx", ".txt"];

function safeFileName(original: string) {
  return original
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

async function ensureBucket() {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    const { data: bucket } = await admin.storage.getBucket(STORAGE_BUCKET);
    if (bucket) return admin;
    await admin.storage.createBucket(STORAGE_BUCKET, {
      public: true,
      fileSizeLimit: MAX_FILE_SIZE,
    });
    return admin;
  } catch (err) {
    console.error("[storage] No se pudo asegurar el bucket:", err);
    return admin;
  }
}

export async function uploadDocumentAndUpdate(caseId: string, formData: FormData) {
  const session = await auth();
  if (!session) return { ok: false, error: "No autorizado" };
  if (
    session.user.role !== Role.ABOGADO &&
    session.user.role !== Role.SUPER_ADMIN &&
    session.user.role !== Role.JEFE_DE_MESA
  ) {
    return { ok: false, error: "Solo el equipo legal puede subir documentos" };
  }

  const description = (formData.get("description") as string)?.trim();
  const file = formData.get("document") as File | null;
  const isCaseResolution = formData.get("isCaseResolution") === "true";

  if (!description) return { ok: false, error: "Debe describir la actualización" };
  if (isCaseResolution && (!file || file.size === 0)) {
    return { ok: false, error: "Adjunta el documento de resolución final antes de marcarlo como tal." };
  }

  // Validación temprana del archivo (antes de tocar la DB)
  if (file && file.size > 0) {
    if (file.size > MAX_FILE_SIZE) {
      return { ok: false, error: `Archivo demasiado grande (máx. ${MAX_FILE_SIZE / 1024 / 1024} MB).` };
    }
    const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
    const mime = file.type || "";
    if (!ALLOWED_EXTENSIONS.includes(ext) && !ALLOWED_MIME.has(mime)) {
      return {
        ok: false,
        error: `Formato no permitido. Usa PDF, Word, Excel, JPG, PNG o TXT.`,
      };
    }
  }

  return await withRls(async (tx) => {
    try {
      await assertCaseActive(tx, caseId);

      const kase = await tx.case.findUnique({
        where: { id: caseId },
        select: { stage: true },
      });
      if (!kase || kase.stage !== CaseStage.IN_PROGRESS) {
        return {
          ok: false,
          error: "El caso debe estar En Desarrollo antes de registrar avances.",
        };
      }

      if (session.user.role === Role.ABOGADO) {
        const activeTimer = await tx.timerSession.findFirst({
          where: {
            lawyerId: session.user.id,
            caseId,
            status: "ACTIVE",
          },
          select: { id: true },
        });
        if (!activeTimer) {
          return {
            ok: false,
            error: "Debes iniciar el conteo de horas antes de publicar avances en este expediente.",
          };
        }
      }

      let documentUrl: string | null = null;

      if (file && file.size > 0) {
        const admin = await ensureBucket();
        const cleanName = safeFileName(file.name) || `documento-${Date.now()}`;
        const timestamp = Date.now();

        if (admin) {
          const storagePath = `cases/${caseId}/${timestamp}_${cleanName}`;
          const { error: uploadError } = await admin.storage
            .from(STORAGE_BUCKET)
            .upload(storagePath, file, {
              cacheControl: "3600",
              upsert: false,
              contentType: file.type || undefined,
            });
          if (uploadError) {
            console.error("[upload] Storage error:", uploadError);
            return { ok: false, error: `No se pudo subir el archivo: ${uploadError.message ?? "error desconocido"}` };
          }
          const { data: publicUrlData } = admin.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
          documentUrl = publicUrlData.publicUrl;
        } else {
          // Local disk fallback — stores in public/uploads/cases/{caseId}/
          const uploadsDir = path.join(process.cwd(), "public", "uploads", "cases", caseId);
          fs.mkdirSync(uploadsDir, { recursive: true });
          const filename = `${timestamp}_${cleanName}`;
          const diskPath = path.join(uploadsDir, filename);
          const buffer = Buffer.from(await file.arrayBuffer());
          fs.writeFileSync(diskPath, buffer);
          documentUrl = `/uploads/cases/${caseId}/${filename}`;
        }
      }

      const update = await tx.update.create({
        data: {
          caseId,
          description: isCaseResolution ? `Resolución final del caso\n\n${description}` : description,
          document_url: documentUrl,
        },
        select: { id: true, caseId: true },
      });

      await Promise.allSettled([
        enqueueWhatsApp({ kind: "case_update", caseId: update.caseId, updateId: update.id }),
        enqueueEmail({ kind: "case_update", caseId: update.caseId, updateId: update.id }),
      ]);

      revalidateTag(`case:${caseId}`);
      revalidatePath(`/admin/casos/${caseId}`);
      revalidatePath("/portal");

      return { ok: true, documentUrl };
    } catch (err: any) {
      console.error("[upload] Excepción:", err);
      return { ok: false, error: err?.message || "Error al registrar actualización" };
    }
  });
}
