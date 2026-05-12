"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { assertCaseActive, CaseHaltedError } from "@/lib/case-health";
import { enqueueWhatsApp, enqueueEmail } from "@/lib/notifications";
import { encodeAudioMessage, encodeFileMessage } from "@/lib/chat-message";
import { supabase } from "@/lib/supabase-client";
import { CommentType, Role } from "@prisma/client";

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
  // Only staff members can post updates (Abogado, Jefe de Mesa, SuperAdmin)
  if (role !== Role.ABOGADO && role !== Role.SUPER_ADMIN && role !== Role.JEFE_DE_MESA) {
    return { ok: false, code: "forbidden", reason: "only staff may upload case updates" };
  }
  if (!input.description.trim()) return { ok: false, code: "invalid", reason: "empty description" };

  try {
    const update = await withRls(async (tx) => {
      await assertCaseActive(tx, input.caseId);
      return tx.update.create({
        data: {
          caseId: input.caseId,
          description: input.description.trim(),
          document_url: input.documentUrl ?? null,
        },
        select: { id: true, caseId: true },
      });
    });

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
  if (!input.body.trim()) return { ok: false, code: "invalid", reason: "empty body" };

  // Clients can only post PUBLIC comments. INTERNAL is staff-only and
  // additionally enforced by the comments_via_case_internal RLS policy.
  if (session.user.role === Role.CLIENTE && input.type !== CommentType.PUBLIC) {
    return { ok: false, code: "forbidden", reason: "clients cannot post internal comments" };
  }

  try {
    const comment = await withRls(async (tx) => {
      // INTERNAL comments are not blocked by HALTED_BY_PAYMENT — staff still
      // need to coordinate. PUBLIC comments are gated like Updates because they
      // notify the client externally.
      if (input.type === CommentType.PUBLIC) {
        await assertCaseActive(tx, input.caseId);
      }
      return tx.comment.create({
        data: {
          caseId: input.caseId,
          authorId: session.user.id,
          body: input.body.trim(),
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

export async function postAudioComment(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session) return { ok: false, code: "forbidden", reason: "unauthenticated" };

  const caseId = String(formData.get("caseId") ?? "");
  const rawType = String(formData.get("type") ?? CommentType.PUBLIC);
  const type = rawType === CommentType.INTERNAL ? CommentType.INTERNAL : CommentType.PUBLIC;
  const file = formData.get("audio");

  if (!caseId) return { ok: false, code: "invalid", reason: "missing case id" };
  if (!(file instanceof File)) return { ok: false, code: "invalid", reason: "missing audio file" };
  if (!file.type.startsWith("audio/")) return { ok: false, code: "invalid", reason: "El archivo debe ser audio." };
  if (file.size > 15 * 1024 * 1024) return { ok: false, code: "invalid", reason: "El audio supera los 15 MB." };

  if (session.user.role === Role.CLIENTE && type !== CommentType.PUBLIC) {
    return { ok: false, code: "forbidden", reason: "clients cannot post internal comments" };
  }

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

    const { data } = supabase.storage.from("case-audio").getPublicUrl(fileName);
    const body = encodeAudioMessage({
      kind: "audio",
      url: data.publicUrl,
      name: file.name || `audio.${ext}`,
      mime: file.type,
      size: file.size,
    });

    const comment = await withRls((tx) =>
      tx.comment.create({
        data: {
          caseId,
          authorId: session.user.id,
          body,
          type,
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
      }),
    );

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

  if (!caseId) return { ok: false, code: "invalid", reason: "missing case id" };
  if (!(file instanceof File)) return { ok: false, code: "invalid", reason: "missing file" };
  if (file.size > 25 * 1024 * 1024) return { ok: false, code: "invalid", reason: "El archivo supera los 25 MB." };
  if (!ALLOWED_FILE_MIME.has(file.type) && !file.name.match(/\.(pdf|jpg|jpeg|png|webp|doc|docx)$/i)) {
    return { ok: false, code: "invalid", reason: "Formato no permitido. Usa PDF, Word, JPG o PNG." };
  }
  if (session.user.role === Role.CLIENTE && type !== CommentType.PUBLIC) {
    return { ok: false, code: "forbidden", reason: "clients cannot post internal comments" };
  }

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
      const { data } = admin.storage.from("documents").getPublicUrl(storagePath);
      fileUrl = data.publicUrl;
    } else {
      const nodePath = await import("path");
      const nodeFs = await import("fs");
      const uploadsDir = nodePath.default.join(process.cwd(), "public", "uploads", "cases", caseId, "chat");
      nodeFs.default.mkdirSync(uploadsDir, { recursive: true });
      const filename = `${timestamp}_${cleanName}`;
      nodeFs.default.writeFileSync(nodePath.default.join(uploadsDir, filename), Buffer.from(await file.arrayBuffer()));
      fileUrl = `/uploads/cases/${caseId}/chat/${filename}`;
    }

    const body = encodeFileMessage({ kind: "file", url: fileUrl, name: file.name, mime: file.type, size: file.size });
    const comment = await withRls((tx) =>
      tx.comment.create({
        data: { caseId, authorId: session.user.id, body, type },
        select: {
          id: true, caseId: true, type: true, body: true, createdAt: true,
          authorId: true, author: { select: { fullName: true } },
        },
      }),
    );

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
