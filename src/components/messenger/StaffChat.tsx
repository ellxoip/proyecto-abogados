"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, isPlaceholder } from "@/lib/supabase-client";
import { RealtimeChannel } from "@supabase/supabase-js";
import { CommentType } from "@prisma/client";
import { postComment } from "@/app/admin/casos/[id]/actions";
import { parseAudioMessage } from "@/lib/chat-message";
import { Send } from "lucide-react";

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
};

export function StaffChat({ caseId, initialComments, realtimeToken, currentUserId }: Props) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [newMessage, setNewMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isPlaceholder) return;
    if (realtimeToken) supabase.realtime.setAuth(realtimeToken);

    const channel: RealtimeChannel = supabase.channel(`case:${caseId}:internal`);
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
          if (incoming.type && incoming.type !== CommentType.INTERNAL) return;
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
    if (!body || pending) return;

    setError(null);
    setNewMessage("");
    setPending(true);

    const tempId = `temp-internal-${Date.now()}`;
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
      const res = await postComment({ caseId, body, type: CommentType.INTERNAL });
      if (!res.ok) {
        setComments((prev) => prev.filter((c) => c.id !== tempId));
        setNewMessage(body);
        setError(res.reason);
        return;
      }
      if (res.comment) {
        setComments((prev) => prev.map((c) => (c.id === tempId ? res.comment! : c)));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-[var(--surface)] border rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-slate-800 text-[var(--gold)] flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-widest">Chat Interno de Equipo</span>
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
      </div>
      <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-4 bg-[rgba(255,255,255,0.02)] min-h-[300px]">
        {comments.map((c) => {
          const isMe = c.authorId === currentUserId;
          return (
            <div key={c.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
              {!isMe && (
                <span className="text-[10px] font-bold text-slate-500 mb-1 ml-1 uppercase tracking-tighter">
                  {c.authorName ?? "Colega"}
                </span>
              )}
              <div
                className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm shadow-sm ${
                  isMe
                    ? "bg-[#25364B] text-[var(--gold)] rounded-tr-none"
                    : "bg-[var(--surface)] border text-slate-800 rounded-tl-none"
                }`}
              >
                <MessageBody body={c.body} />
                <div className={`text-[10px] mt-1 text-right ${isMe ? "text-[#E7D08B]" : "text-slate-400"}`}>
                  {new Date(c.createdAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          );
        })}

        {comments.length === 0 && (
          <div className="text-xs text-center text-slate-400 py-8">No hay mensajes internos todavia.</div>
        )}
      </div>
      {error && <div className="px-4 py-2 text-xs text-red-600 bg-[rgba(239,68,68,0.1)] border-t">{error}</div>}
      <form onSubmit={handleSend} className="p-3 bg-[var(--surface)] border-t flex gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Mensaje al equipo (no visible para el cliente)..."
          className="flex-1 text-sm border rounded px-3 py-2 outline-none focus:border-slate-900"
        />
        <button
          type="submit"
          disabled={!newMessage.trim() || pending}
          className="bg-slate-900 text-[var(--gold)] text-sm px-4 py-2 rounded disabled:opacity-50 flex items-center gap-1.5"
        >
          <Send className="w-3.5 h-3.5" />
          {pending ? "Enviando..." : "Enviar"}
        </button>
      </form>
    </div>
  );
}

function MessageBody({ body }: { body: string }) {
  const audio = parseAudioMessage(body);
  if (!audio) return <p className="whitespace-pre-wrap break-words">{body}</p>;
  return <audio controls preload="metadata" src={audio.url} className="w-full max-w-[280px]" />;
}
