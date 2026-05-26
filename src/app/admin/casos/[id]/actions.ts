"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { assertCaseActive, CaseHaltedError } from "@/lib/case-health";
import { enqueueWhatsApp, enqueueEmail } from "@/lib/notifications";
import { encodeAudioMessage, encodeFileMessage } from "@/lib/chat-message";
import { supabase } from "@/lib/supabase-client";
import { CaseStage, CommentType, Role } from "@/lib/db-enums";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { enforceMessageModeration } from "@/lib/moderation";

// Límites duros para postComment / postAudioComment / postFileComment:
//   - body máx 4000 chars (UI muestra contador; este es el cap server-side)
//   - 5 mensajes / 10 segundos por usuario (anti-flood)
const COMMENT_MAX_BODY = 4000;
const COMMENT_RATE_MAX = 5;
const COMMENT_RATE_WINDOW_MS = 10_000;
// postUpdate tiene su propio cap (Updates suelen ser más largos que chats).
const UPDATE_MAX_BODY = 8000;
const UPDATE_RATE_MAX = 8;
const UPDATE_RATE_WINDOW_MS = 30_000;
const TIMER_REQUIRED_MESSAGE = "Debes iniciar el conteo de horas antes de publicar avances en este expediente.";

/** Strip caracteres de control (0x00-0x1F excepto \t\n\r) que pueden romper
 *  el render Markdown/HTML del chat o explotar parsers downstream. */
function sanitizeBody(input: string): string {
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidCaseId(id: string): boolean {
  return UUID_REGEX.test(id);
}

export type ActionResult =
  | { ok: true; comment?: CommentResult }
  | { ok: false; code: "halted" | "forbidden" | "invalid"; reason: string };

type CommentResult = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
};

export async function postUpdate(input: {
  caseId: string;
  description: string;
  documentUrl?: string;
}): Promise<ActionResult> {
  const session = await auth();
  if (!session) return { ok: false, code: "forbidden", reason: "unauthenticated" };

  const role = session.user.role;
  // Only staff members can post updates (Abogado, Jefe de Grupo, SuperAdmin).
  // Chequeo de rol antes de cualquier validación de input para que el UI
  // reciba el error semántico correcto.
  if (role !== Role.ABOGADO && role !== Role.SUPER_ADMIN && role !== Role.JEFE_DE_MESA) {
    return { ok: false, code: "forbidden", reason: "only staff may upload case updates" };
  }

  const sanitized = sanitizeBody(input.description).trim();
  if (!sanitized) return { ok: false, code: "invalid", reason: "empty description" };
  if (sanitized.length > UPDATE_MAX_BODY) {
    return {
      ok: false,
      code: "invalid",
      reason: `La descripción supera el máximo de ${UPDATE_MAX_BODY} caracteres.`,
    };
  }

  if (!isValidCaseId(input.caseId)) {
    return { ok: false, code: "invalid", reason: "case id inválido" };
  }

  // Anti-flood: 8 updates / 30s por usuario.
  const rl = checkRateLimit(`update:${session.user.id}`, {
    max: UPDATE_RATE_MAX,
    windowMs: UPDATE_RATE_WINDOW_MS,
  });
  if (!rl.allowed) {
    return { ok: false, code: "invalid", reason: rl.reason };
  }

  try {
    const update = await withRls(async (tx) => {
      await assertCaseActive(tx, input.caseId);
      const kase = await tx.case.findUnique({
        where: { id: input.caseId },
        select: { stage: true },
      });
      if (!kase || kase.stage !== CaseStage.IN_PROGRESS) {
        return {
          id: "",
          caseId: input.caseId,
          __blocked: true,
        };
      }
      if (role === Role.ABOGADO) {
        const activeTimer = await tx.timerSession.findFirst({
          where: {
            lawyerId: session.user.id,
            caseId: input.caseId,
            status: "ACTIVE",
          },
          select: { id: true },
        });
        if (!activeTimer) {
          throw new Error(TIMER_REQUIRED_MESSAGE);
        }
      }
      const created = await tx.update.create({
        data: {
          caseId: input.caseId,
          description: sanitized,
          document_url: input.documentUrl ?? null,
        },
        select: { id: true, caseId: true },
      });
      await logAudit({
        tx,
        action: "COMMENT_POSTED", // mismo enum; channel + template distinguen
        caseId: created.caseId,
        actorId: session.user.id,
        channel: "case-update",
        template: input.documentUrl ? "update_with_doc" : "update_text",
        status: "ok",
        message: `Update #${created.id} (${sanitized.length} chars)${input.documentUrl ? " · con adjunto" : ""}`,
        metadata: { updateId: created.id, length: sanitized.length, hasDocument: !!input.documentUrl },
      });
      return created;
    });

    if ("__blocked" in update) {
      return {
        ok: false,
        code: "invalid",
        reason: "El caso debe estar En Desarrollo antes de registrar avances.",
      };
    }

    await Promise.allSettled([
      enqueueWhatsApp({ kind: "case_update", caseId: update.caseId, updateId: update.id }),
      enqueueEmail({ kind: "case_update", caseId: update.caseId, updateId: update.id }),
    ]);

    revalidateTag(`case:${input.caseId}`);
    revalidatePath(`/admin/casos/${input.caseId}`);
    revalidatePath("/portal");
    return { ok: true };
  } catch (e) {
    if (e instanceof CaseHaltedError) return { ok: false, code: "halted", reason: e.reason };
    if (e instanceof Error && e.message === TIMER_REQUIRED_MESSAGE) {
      return { ok: false, code: "invalid", reason: TIMER_REQUIRED_MESSAGE };
    }
    throw e;
  }
}

export async function postComment(input: {
  caseId: string;
  body: string;
  type: CommentType;
}): Promise<ActionResult> {
  const session = await auth();
  if (!session) return { ok: false, code: "forbidden", reason: "unauthenticated" };

  // Clients can only post PUBLIC comments. INTERNAL is staff-only and
  // additionally enforced by the comments_via_case_internal RLS policy.
  // (Chequeo de rol antes de input para devolver el error semánticamente más
  // útil al UI.)
  if (session.user.role === Role.CLIENTE && input.type !== CommentType.PUBLIC) {
    return { ok: false, code: "forbidden", reason: "clients cannot post internal comments" };
  }

  const sanitized = sanitizeBody(input.body).trim();
  if (!sanitized) return { ok: false, code: "invalid", reason: "empty body" };
  if (sanitized.length > COMMENT_MAX_BODY) {
    return {
      ok: false,
      code: "invalid",
      reason: `El mensaje supera el máximo de ${COMMENT_MAX_BODY} caracteres.`,
    };
  }

  // UUID check antes de tocar DB pero después de input rápido.
  if (!isValidCaseId(input.caseId)) {
    return { ok: false, code: "invalid", reason: "case id inválido" };
  }

  // Anti-flood: 5 mensajes / 10s por usuario. Aplica a cualquier tipo.
  const rl = checkRateLimit(`comment:${session.user.id}`, {
    max: COMMENT_RATE_MAX,
    windowMs: COMMENT_RATE_WINDOW_MS,
  });
  if (!rl.allowed) {
    return { ok: false, code: "invalid", reason: rl.reason };
  }

  // Moderación del chat: bloquea groserías/insultos/agresiones y aplica baneo
  // por strikes. Aplica a TODOS los roles (cliente y abogados) por igual.
  const moderation = await enforceMessageModeration({
    userId: session.user.id,
    caseId: input.caseId,
    text: sanitized,
  });
  if (!moderation.ok) {
    return { ok: false, code: "invalid", reason: moderation.reason };
  }

  try {
    const comment = await withRls(async (tx) => {
      // INTERNAL comments are not blocked by HALTED_BY_PAYMENT — staff still
      // need to coordinate. PUBLIC comments are gated like Updates because they
      // notify the client externally.
      if (input.type === CommentType.PUBLIC) {
        await assertCaseActive(tx, input.caseId);
      }
      const created = await tx.comment.create({
        data: {
          caseId: input.caseId,
          authorId: session.user.id,
          body: sanitized,
          type: input.type,
        },
        select: {
          id: true,
          caseId: true,
          type: true,
          body: true,
          createdAt: true,
          authorId: true,
          author: { select: { fullName: true } },
        },
      });
      // Trazabilidad forense: quién, cuándo, qué tipo, qué caso.
      await logAudit({
        tx,
        action: "COMMENT_POSTED",
        caseId: created.caseId,
        actorId: session.user.id,
        channel: "chat",
        template: input.type === CommentType.PUBLIC ? "public_comment" : "internal_comment",
        status: "ok",
        message: `Comment ${input.type} #${created.id} (${sanitized.length} chars)`,
        metadata: { commentId: created.id, type: input.type, length: sanitized.length },
      });
      return created;
    });

    if (comment.type === CommentType.PUBLIC) {
      await Promise.allSettled([
        enqueueWhatsApp({ kind: "public_comment", caseId: comment.caseId, commentId: comment.id }),
        enqueueEmail({ kind: "public_comment", caseId: comment.caseId, commentId: comment.id }),
      ]);
    }

    revalidateTag(`case:${input.caseId}`);
    revalidatePath(`/admin/casos/${input.caseId}`);
    return { ok: true, comment: toCommentResult(comment) };
  } catch (e) {
    if (e instanceof CaseHaltedError) return { ok: false, code: "halted", reason: e.reason };
    throw e;
  }
}

const ALLOWED_AUDIO_MIME = new Set([
  "audio/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/m4a",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
]);

export async function postAudioComment(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session) return { ok: false, code: "forbidden", reason: "unauthenticated" };

  const caseId = String(formData.get("caseId") ?? "");
  const rawType = String(formData.get("type") ?? CommentType.PUBLIC);
  const type = rawType === CommentType.INTERNAL ? CommentType.INTERNAL : CommentType.PUBLIC;
  const file = formData.get("audio");

  if (!caseId || !isValidCaseId(caseId)) {
    return { ok: false, code: "invalid", reason: "case id inválido" };
  }
  if (!(file instanceof File)) return { ok: false, code: "invalid", reason: "missing audio file" };
  // MIME check estricto contra allowlist (mejor que prefijo "audio/" — bloquea audio/exotic raros).
  if (!ALLOWED_AUDIO_MIME.has(file.type) && !file.type.startsWith("audio/")) {
    return { ok: false, code: "invalid", reason: "Formato de audio no permitido." };
  }
  if (file.size === 0) return { ok: false, code: "invalid", reason: "Archivo vacío." };
  if (file.size > 15 * 1024 * 1024) return { ok: false, code: "invalid", reason: "El audio supera los 15 MB." };

  if (session.user.role === Role.CLIENTE && type !== CommentType.PUBLIC) {
    return { ok: false, code: "forbidden", reason: "clients cannot post internal comments" };
  }

  // Anti-flood compartido con postComment (audios y textos cuentan al mismo bucket).
  const rl = checkRateLimit(`comment:${session.user.id}`, {
    max: COMMENT_RATE_MAX,
    windowMs: COMMENT_RATE_WINDOW_MS,
  });
  if (!rl.allowed) {
    return { ok: false, code: "invalid", reason: rl.reason };
  }

  let uploadedPath: string | null = null;
  try {
    if (type === CommentType.PUBLIC) {
      await withRls((tx) => assertCaseActive(tx, caseId));
    }

    const ext = extensionFromMime(file.type);
    const fileName = `${caseId}/${Date.now()}_${session.user.id}.${ext}`;
    const { error } = await supabase.storage.from("case-audio").upload(fileName, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

    if (error) {
      return { ok: false, code: "invalid", reason: `No se pudo subir el audio: ${error.message}` };
    }
    uploadedPath = fileName;

    const { data } = supabase.storage.from("case-audio").getPublicUrl(fileName);
    const body = encodeAudioMessage({
      kind: "audio",
      url: data.publicUrl,
      name: file.name || `audio.${ext}`,
      mime: file.type,
      size: file.size,
    });

    const comment = await withRls(async (tx) => {
      const created = await tx.comment.create({
        data: { caseId, authorId: session.user.id, body, type },
        select: {
          id: true,
          caseId: true,
          type: true,
          body: true,
          createdAt: true,
          authorId: true,
          author: { select: { fullName: true } },
        },
      });
      await logAudit({
        tx,
        action: "COMMENT_POSTED",
        caseId: created.caseId,
        actorId: session.user.id,
        channel: "chat",
        template: `audio_${type.toLowerCase()}`,
        status: "ok",
        message: `Audio ${type} #${created.id} (${(file.size / 1024).toFixed(0)} KB)`,
        metadata: { commentId: created.id, type, size: file.size, mime: file.type, storagePath: fileName },
      });
      return created;
    });

    if (comment.type === CommentType.PUBLIC) {
      await Promise.allSettled([
        enqueueWhatsApp({ kind: "public_comment", caseId: comment.caseId, commentId: comment.id }),
        enqueueEmail({ kind: "public_comment", caseId: comment.caseId, commentId: comment.id }),
      ]);
    }

    revalidateTag(`case:${caseId}`);
    revalidatePath(`/admin/casos/${caseId}`);
    return { ok: true, comment: toCommentResult(comment) };
  } catch (e) {
    // Si subimos el blob pero el Comment.create explotó, intentamos borrar
    // el blob huérfano (best-effort, no rompe el error original).
    if (uploadedPath) {
      try {
        await supabase.storage.from("case-audio").remove([uploadedPath]);
      } catch {
        // ignore — el blob queda; un sweeper podría limpiarlo más tarde.
      }
    }
    if (e instanceof CaseHaltedError) return { ok: false, code: "halted", reason: e.reason };
    throw e;
  }
}

const ALLOWED_FILE_MIME = new Set([
  "application/pdf",
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function safeFileName(original: string) {
  return original
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export async function postFileComment(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session) return { ok: false, code: "forbidden", reason: "unauthenticated" };

  const caseId = String(formData.get("caseId") ?? "");
  const rawType = String(formData.get("type") ?? CommentType.PUBLIC);
  const type = rawType === CommentType.INTERNAL ? CommentType.INTERNAL : CommentType.PUBLIC;
  const file = formData.get("file");

  if (!caseId || !isValidCaseId(caseId)) {
    return { ok: false, code: "invalid", reason: "case id inválido" };
  }
  if (!(file instanceof File)) return { ok: false, code: "invalid", reason: "missing file" };
  if (file.size === 0) return { ok: false, code: "invalid", reason: "Archivo vacío." };
  if (file.size > 25 * 1024 * 1024) return { ok: false, code: "invalid", reason: "El archivo supera los 25 MB." };

  // Doble check: mime tipo declarado + extensión real. Si NINGUNO de los dos
  // matchea la allowlist, rechaza. Esto bloquea bypass por `image/jpeg` con
  // extensión `.exe` o viceversa.
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const allowedExt = ["pdf", "jpg", "jpeg", "png", "webp", "doc", "docx"];
  if (!ALLOWED_FILE_MIME.has(file.type) || !allowedExt.includes(ext)) {
    return {
      ok: false,
      code: "invalid",
      reason: "Formato no permitido. Usa PDF, Word, JPG, PNG o WebP.",
    };
  }

  if (session.user.role === Role.CLIENTE && type !== CommentType.PUBLIC) {
    return { ok: false, code: "forbidden", reason: "clients cannot post internal comments" };
  }

  // Anti-flood compartido con postComment (textos + audios + archivos).
  const rl = checkRateLimit(`comment:${session.user.id}`, {
    max: COMMENT_RATE_MAX,
    windowMs: COMMENT_RATE_WINDOW_MS,
  });
  if (!rl.allowed) {
    return { ok: false, code: "invalid", reason: rl.reason };
  }

  let cleanupSupabasePath: string | null = null;
  let cleanupLocalPath: string | null = null;

  try {
    if (type === CommentType.PUBLIC) {
      await withRls((tx) => assertCaseActive(tx, caseId));
    }

    const cleanName = safeFileName(file.name) || `documento-${Date.now()}`;
    const timestamp = Date.now();
    let fileUrl: string;

    const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
    const admin = getSupabaseAdmin();
    if (admin) {
      const storagePath = `cases/${caseId}/chat/${timestamp}_${cleanName}`;
      const { error } = await admin.storage.from("documents").upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });
      if (error) return { ok: false, code: "invalid", reason: `No se pudo subir el archivo: ${error.message}` };
      cleanupSupabasePath = storagePath;
      const { data } = admin.storage.from("documents").getPublicUrl(storagePath);
      fileUrl = data.publicUrl;
    } else {
      const nodePath = await import("path");
      const nodeFs = await import("fs");
      // caseId ya validado contra UUID regex arriba — no hay path traversal posible.
      const uploadsDir = nodePath.default.join(process.cwd(), "public", "uploads", "cases", caseId, "chat");
      nodeFs.default.mkdirSync(uploadsDir, { recursive: true });
      const filename = `${timestamp}_${cleanName}`;
      const fullPath = nodePath.default.join(uploadsDir, filename);
      nodeFs.default.writeFileSync(fullPath, Buffer.from(await file.arrayBuffer()));
      cleanupLocalPath = fullPath;
      fileUrl = `/uploads/cases/${caseId}/chat/${filename}`;
    }

    const body = encodeFileMessage({
      kind: "file",
      url: fileUrl,
      name: file.name,
      mime: file.type,
      size: file.size,
    });
    const comment = await withRls(async (tx) => {
      const created = await tx.comment.create({
        data: { caseId, authorId: session.user.id, body, type },
        select: {
          id: true,
          caseId: true,
          type: true,
          body: true,
          createdAt: true,
          authorId: true,
          author: { select: { fullName: true } },
        },
      });
      await logAudit({
        tx,
        action: "COMMENT_POSTED",
        caseId: created.caseId,
        actorId: session.user.id,
        channel: "chat",
        template: `file_${type.toLowerCase()}`,
        status: "ok",
        message: `File ${type} #${created.id} (${(file.size / 1024).toFixed(0)} KB · ${ext})`,
        metadata: {
          commentId: created.id,
          type,
          size: file.size,
          mime: file.type,
          extension: ext,
          filename: cleanName,
        },
      });
      return created;
    });

    if (comment.type === CommentType.PUBLIC) {
      await Promise.allSettled([
        enqueueWhatsApp({ kind: "public_comment", caseId: comment.caseId, commentId: comment.id }),
        enqueueEmail({ kind: "public_comment", caseId: comment.caseId, commentId: comment.id }),
      ]);
    }

    revalidateTag(`case:${caseId}`);
    revalidatePath(`/admin/casos/${caseId}`);
    return { ok: true, comment: toCommentResult(comment) };
  } catch (e) {
    // Limpieza best-effort del blob/archivo huérfano si el Comment.create falló.
    if (cleanupSupabasePath) {
      try {
        const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
        const admin = getSupabaseAdmin();
        await admin?.storage.from("documents").remove([cleanupSupabasePath]);
      } catch {
        // ignore
      }
    }
    if (cleanupLocalPath) {
      try {
        const nodeFs = await import("fs");
        nodeFs.default.unlinkSync(cleanupLocalPath);
      } catch {
        // ignore
      }
    }
    if (e instanceof CaseHaltedError) return { ok: false, code: "halted", reason: e.reason };
    throw e;
  }
}

function toCommentResult(comment: {
  id: string;
  body: string;
  createdAt: Date;
  authorId: string;
  author: { fullName: string };
}) {
  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    authorId: comment.authorId,
    authorName: comment.author.fullName,
  };
}

function extensionFromMime(mime: string) {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  return "webm";
}
