"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, isPlaceholder } from "@/lib/supabase-client";
import { RealtimeChannel } from "@supabase/supabase-js";
import { CommentType, Role } from "@/lib/db-enums";
import { postAudioComment, postComment, postFileComment } from "@/app/admin/casos/[id]/actions";
import { encodeAudioMessage, encodeFileMessage, parseAudioMessage, parseFileMessage } from "@/lib/chat-message";
import { FileText, Mic, Paperclip, Send, Square } from "lucide-react";

type Comment = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName?: string;
};

type Props = {
  caseId: string;
  initialComments: Comment[];
  realtimeToken: string;
  currentUserId: string;
  isFinished?: boolean;
  role?: Role;
};

export function ClientChat({
  caseId,
  initialComments,
  realtimeToken,
  currentUserId,
  isFinished,
  role,
}: Props) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [newMessage, setNewMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [textPending, setTextPending] = useState(false);
  const [audioPending, setAudioPending] = useState(false);
  const [recording, setRecording] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filePending, setFilePending] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  useEffect(() => {
    if (isPlaceholder) return;
    if (realtimeToken) supabase.realtime.setAuth(realtimeToken);

    const channel: RealtimeChannel = supabase.channel(`case:${caseId}:public`);
    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: `caseId=eq.${caseId}`,
        },
        async (payload) => {
          const incoming = payload.new as any;
          if (incoming.type && incoming.type !== CommentType.PUBLIC) return;
          setComments((prev) =>
            prev.find((c) => c.id === incoming.id)
              ? prev
              : [...prev, { ...incoming, authorName: incoming.authorName ?? "Staff" }],
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [caseId, realtimeToken]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [comments]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const body = newMessage.trim();
    if (!body || textPending || isFinished) return;

    setError(null);
    setNewMessage("");
    setTextPending(true);

    const tempId = `temp-text-${Date.now()}`;
    setComments((prev) => [
      ...prev,
      {
        id: tempId,
        body,
        createdAt: new Date().toISOString(),
        authorId: currentUserId,
        authorName: "Tu",
      },
    ]);

    try {
      const res = await postComment({ caseId, body, type: CommentType.PUBLIC });
      if (!res.ok) {
        setComments((prev) => prev.filter((c) => c.id !== tempId));
        setNewMessage(body);
        setError(
          res.code === "halted"
            ? "El caso esta detenido por mora. No se pueden enviar mensajes hasta regularizar el pago."
            : res.reason,
        );
        return;
      }

      if (res.comment) {
        setComments((prev) => prev.map((c) => (c.id === tempId ? res.comment! : c)));
      }
    } finally {
      setTextPending(false);
    }
  }

  async function handleAudioFile(file: File) {
    if (isFinished || audioPending) return;

    setError(null);
    setAudioPending(true);

    const localUrl = URL.createObjectURL(file);
    const tempId = `temp-audio-${Date.now()}`;
    setComments((prev) => [
      ...prev,
      {
        id: tempId,
        body: encodeAudioMessage({
          kind: "audio",
          url: localUrl,
          name: file.name || "audio.webm",
          mime: file.type || "audio/webm",
          size: file.size,
        }),
        createdAt: new Date().toISOString(),
        authorId: currentUserId,
        authorName: "Tu",
      },
    ]);

    try {
      const formData = new FormData();
      formData.append("caseId", caseId);
      formData.append("type", CommentType.PUBLIC);
      formData.append("audio", file);
      const res = await postAudioComment(formData);

      if (!res.ok) {
        setComments((prev) => prev.filter((c) => c.id !== tempId));
        setError(res.code === "halted" ? "El caso esta detenido por mora. No se pueden enviar audios." : res.reason);
        return;
      }

      if (res.comment) {
        setComments((prev) => prev.map((c) => (c.id === tempId ? res.comment! : c)));
      }
    } finally {
      URL.revokeObjectURL(localUrl);
      setAudioPending(false);
    }
  }

  async function handleDocumentFile(file: File) {
    if (isFinished || filePending) return;
    setError(null);
    setFilePending(true);

    const localUrl = URL.createObjectURL(file);
    const tempId = `temp-file-${Date.now()}`;
    setComments((prev) => [
      ...prev,
      {
        id: tempId,
        body: encodeFileMessage({ kind: "file", url: localUrl, name: file.name, mime: file.type, size: file.size }),
        createdAt: new Date().toISOString(),
        authorId: currentUserId,
        authorName: "Tu",
      },
    ]);

    try {
      const formData = new FormData();
      formData.append("caseId", caseId);
      formData.append("type", CommentType.PUBLIC);
      formData.append("file", file);
      const res = await postFileComment(formData);

      if (!res.ok) {
        setComments((prev) => prev.filter((c) => c.id !== tempId));
        setError(res.reason);
        return;
      }
      if (res.comment) {
        setComments((prev) => prev.map((c) => (c.id === tempId ? res.comment! : c)));
      }
    } finally {
      URL.revokeObjectURL(localUrl);
      setFilePending(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setRecording(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador no permite grabar audio desde el chat.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const file = new File([blob], `autorizacion-voz-${Date.now()}.webm`, { type: blob.type });
        void handleAudioFile(file);
      };
      recorder.start();
      setRecording(true);
    } catch {
      setError("No se pudo acceder al microfono. Revisa los permisos del navegador.");
    }
  }

  const placeholderRoleHint =
    role === Role.CLIENTE ? "Escribe a tu abogado..." : "Escribe al cliente (mensaje publico)...";

  const headerTitle =
    role === Role.CLIENTE ? "Mensajeria con el o los abogados" : "Mensajeria con el cliente";

  return (
    <div className="flex flex-col h-full bg-[var(--surface)] border rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-[#1e3a8a] text-[var(--gold)] flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-widest">{headerTitle}</span>
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
      </div>

      <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-4 bg-[var(--surface-3)] min-h-[300px]">
        {comments.map((c) => {
          const isMe = c.authorId === currentUserId;
          return (
            <div key={c.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
              {!isMe && (
                <span className="text-[10px] font-bold text-slate-500 mb-1 ml-1 uppercase tracking-tighter">
                  {c.authorName ?? "Staff"}
                </span>
              )}
              <div
                className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm shadow-sm ${
                  isMe
                    ? "bg-[#25364B] text-[var(--gold)] rounded-tr-none"
                    : "bg-[var(--surface)] border text-slate-800 rounded-tl-none"
                }`}
              >
                <MessageBody body={c.body} isMe={isMe} />
                <div className={`text-[10px] mt-1 text-right ${isMe ? "text-[#E7D08B]" : "text-slate-400"}`}>
                  {new Date(c.createdAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          );
        })}

        {comments.length === 0 && (
          <div className="text-xs text-center text-slate-400 py-8">No hay mensajes aun.</div>
        )}
      </div>
      {error && <div className="px-4 py-2 text-xs text-red-600 bg-[rgba(239,68,68,0.1)] border-t">{error}</div>}
      {!isFinished ? (
        <form onSubmit={handleSend} className="p-3 bg-[var(--surface)] border-t flex gap-2">
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              if (file) void handleAudioFile(file);
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              if (file) void handleDocumentFile(file);
            }}
          />
          <button
            type="button"
            onClick={toggleRecording}
            disabled={audioPending}
            title={recording ? "Detener grabacion" : "Grabar audio"}
            className={`px-3 py-2 rounded border text-sm transition-colors ${
              recording
                ? "bg-red-50 text-red-600 border-red-200"
                : "text-[var(--gold)] border-[var(--border-glass)] hover:border-[var(--gold)]"
            } disabled:opacity-50`}
          >
            {recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={filePending || isFinished}
            title="Adjuntar documento (PDF, imagen, Word)"
            className="px-3 py-2 rounded border text-[var(--gold)] border-[var(--border-glass)] hover:border-[var(--gold)] text-sm disabled:opacity-50"
          >
            {filePending ? <Paperclip className="w-4 h-4 animate-pulse" /> : <Paperclip className="w-4 h-4" />}
          </button>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={placeholderRoleHint}
            className="flex-1 text-sm border rounded px-3 py-2 outline-none focus:border-blue-900"
            disabled={isFinished}
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || textPending}
            className="bg-[#1e3a8a] text-[var(--gold)] text-sm px-4 py-2 rounded disabled:opacity-50 flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            {textPending ? "Enviando..." : "Enviar"}
          </button>
        </form>
      ) : (
        <div className="p-3 bg-slate-100 text-center text-xs text-slate-500 border-t">
          El caso esta terminado. No se pueden enviar mas mensajes.
        </div>
      )}
    </div>
  );
}

function MessageBody({ body, isMe }: { body: string; isMe: boolean }) {
  const audio = parseAudioMessage(body);
  if (audio) {
    return (
      <div className="space-y-2 min-w-[220px]">
        <div className={`text-[11px] font-bold uppercase tracking-widest ${isMe ? "text-[var(--gold)]" : "text-slate-600"}`}>
          Audio compartido
        </div>
        <audio controls preload="metadata" src={audio.url} className="w-full max-w-[280px]" />
      </div>
    );
  }

  const fileMsg = parseFileMessage(body);
  if (fileMsg) {
    const sizeKb = Math.round(fileMsg.size / 1024);
    return (
      <a
        href={fileMsg.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 min-w-[180px] group/file"
      >
        <div
          className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
          style={{ background: isMe ? "rgba(201,168,76,0.15)" : "rgba(30,58,138,0.1)" }}
        >
          <FileText className="w-4 h-4" style={{ color: isMe ? "var(--gold)" : "#1e3a8a" }} />
        </div>
        <div className="min-w-0">
          <div
            className="text-sm font-semibold truncate max-w-[180px] group-hover/file:underline"
            style={{ color: isMe ? "var(--gold)" : "#1e3a8a" }}
          >
            {fileMsg.name}
          </div>
          <div className="text-[10px]" style={{ color: isMe ? "rgba(201,168,76,0.7)" : "#94a3b8" }}>
            {sizeKb} KB · Toca para abrir
          </div>
        </div>
      </a>
    );
  }

  return <p className="whitespace-pre-wrap break-words">{body}</p>;
}
