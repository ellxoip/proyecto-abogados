"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type FormEvent,
} from "react";
import {
  ArrowDownToLine,
  Bell,
  Check,
  CheckCheck,
  ClipboardCheck,
  Clock3,
  Copy,
  Crown,
  ExternalLink,
  Filter,
  Loader2,
  Mail,
  Maximize2,
  MessageSquare,
  Minimize2,
  Phone,
  Pin,
  RefreshCw,
  Scale,
  Search,
  Send,
  Shield,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import { CategoryBadge } from "@/components/CategoryBadge";
import { CommentType, Role } from "@/lib/db-enums";
import { isOnline } from "@/lib/update-presence";
import { supabase, isPlaceholder as supabaseIsPlaceholder } from "@/lib/supabase-client";
import { parseAudioMessage } from "@/lib/chat-message";
import { postComment } from "@/app/admin/casos/[id]/actions";

// ── Types ─────────────────────────────────────────────────────────────────
type Conversation = {
  caseId: string;
  caseCode: string;
  categoria: any | null;
  clientName: string;
  preview: string;
  authorId: string;
  type: CommentType;
  at: string;
  unreadCount: number;
};

type TeamMember = {
  id: string;
  fullName: string;
  role: Role;
  email: string;
  phone: string;
  lastSeenAt: string | null;
  caseCount: number;
};

type ThreadMessage = {
  id: string;
  body: string;
  type: CommentType;
  createdAt: string;
  authorId: string;
  author: { id: string; fullName: string; role: string };
  isMine: boolean;
  optimistic?: boolean;
  failed?: boolean;
};

type Props = {
  conversations: Conversation[];
  teamMembers: TeamMember[];
  onlineCount: number;
};

type Mode = "mensajes" | "equipo";
type ConversationFilter = "all" | "internal" | "public" | "unread";

const STORAGE_KEY = "hive-control:messenger:pinned";
const READ_STORAGE_KEY = "hive-control:messenger:reads";
const MAX_BODY_CHARS = 4000;

// ── Helpers ───────────────────────────────────────────────────────────────
function relativeTime(d: string) {
  const date = new Date(d);
  const diff = Date.now() - date.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "ahora";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} d`;
  return date.toLocaleDateString("es-CL");
}

function exactTime(d: string) {
  const date = new Date(d);
  return date.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildWhatsAppLink(phone: string, fullName: string) {
  const cleaned = phone.replace(/[^\d]/g, "");
  if (!cleaned) return null;
  const greeting = encodeURIComponent(`Hola ${fullName.split(" ")[0]}, te escribo desde HIVE CONTROL.`);
  return `https://wa.me/${cleaned}?text=${greeting}`;
}

function isSameDay(a: string, b: string) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function dayLabel(d: string) {
  const date = new Date(d);
  const now = new Date();
  if (isSameDay(d, now.toISOString())) return "Hoy";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday.toISOString())) return "Ayer";
  return date.toLocaleDateString("es-CL", { weekday: "long", day: "2-digit", month: "long" });
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

// ── Component ─────────────────────────────────────────────────────────────
export function MessengerCenter({ conversations, teamMembers, onlineCount }: Props) {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";

  const [mode, setMode] = useState<Mode>("mensajes");
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  const initialKey = useMemo(
    () => (conversations[0] ? `${conversations[0].caseId}:${conversations[0].type}` : null),
    [conversations],
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey);
  const [selectedMember, setSelectedMember] = useState<string | null>(teamMembers[0]?.id ?? null);

  // Thread state
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [threadCase, setThreadCase] = useState<{
    id: string;
    code: string;
    stage: string;
    client: { fullName: string };
    categoria: any | null;
  } | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  // Composer state
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);

  // Pinned (client-side persistence)
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  // Last-seen mark per key (so the "unread" filter has a real signal)
  const [readMarks, setReadMarks] = useState<Record<string, string>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!expanded) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setExpanded(false);
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [expanded]);

  // ── Load persistence on mount ──────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPinned(new Set(JSON.parse(raw)));
    } catch {}
    try {
      const raw = localStorage.getItem(READ_STORAGE_KEY);
      if (raw) setReadMarks(JSON.parse(raw));
    } catch {}
  }, []);

  function togglePinned(key: string) {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  }

  function markRead(key: string, at: string) {
    setReadMarks((prev) => {
      const next = { ...prev, [key]: at };
      try {
        localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  // ── Conversation grouping & filters ────────────────────────────────────
  const conversationByKey = useMemo(() => {
    const map = new Map<string, Conversation>();
    for (const c of conversations) map.set(`${c.caseId}:${c.type}`, c);
    return map;
  }, [conversations]);

  const filteredConversations = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations
      .filter((c) => {
        if (filter === "internal" && c.type !== CommentType.INTERNAL) return false;
        if (filter === "public" && c.type !== CommentType.PUBLIC) return false;
        if (filter === "unread") {
          const key = `${c.caseId}:${c.type}`;
          const lastRead = readMarks[key];
          if (lastRead && new Date(c.at).getTime() <= new Date(lastRead).getTime()) return false;
          // Treat own most-recent messages as already-acknowledged.
          if (c.authorId === currentUserId) return false;
        }
        if (q) {
          return `${c.caseCode} ${c.clientName} ${c.preview}`.toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        const keyA = `${a.caseId}:${a.type}`;
        const keyB = `${b.caseId}:${b.type}`;
        const pa = pinned.has(keyA) ? 1 : 0;
        const pb = pinned.has(keyB) ? 1 : 0;
        if (pa !== pb) return pb - pa;
        return new Date(b.at).getTime() - new Date(a.at).getTime();
      });
  }, [conversations, query, filter, pinned, readMarks, currentUserId]);

  const filteredTeamMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teamMembers;
    return teamMembers.filter((m) =>
      `${m.fullName} ${m.email} ${m.phone} ${m.role}`.toLowerCase().includes(q),
    );
  }, [teamMembers, query]);

  useEffect(() => {
    if (mode !== "equipo" || filteredTeamMembers.length === 0) return;
    if (!selectedMember || !filteredTeamMembers.some((m) => m.id === selectedMember)) {
      setSelectedMember(filteredTeamMembers[0].id);
    }
  }, [filteredTeamMembers, mode, selectedMember]);

  const unreadTotal = useMemo(() => {
    return conversations.reduce((acc, c) => {
      const key = `${c.caseId}:${c.type}`;
      const lastRead = readMarks[key];
      const isMine = c.authorId === currentUserId;
      if (isMine) return acc;
      if (lastRead && new Date(c.at).getTime() <= new Date(lastRead).getTime()) return acc;
      return acc + 1;
    }, 0);
  }, [conversations, readMarks, currentUserId]);

  // Active conversation
  const fallbackActiveKey = filteredConversations[0]
    ? `${filteredConversations[0].caseId}:${filteredConversations[0].type}`
    : null;
  const activeKey = selectedKey ?? fallbackActiveKey;
  const [activeCaseIdFromKey, activeTypeFromKey] = activeKey?.split(":") ?? [];
  const emptyChannelAt = useMemo(() => new Date().toISOString(), [activeKey]);
  const storedActive = activeKey ? conversationByKey.get(activeKey) ?? null : null;
  const active =
    storedActive ??
    (activeCaseIdFromKey && activeTypeFromKey && threadCase?.id === activeCaseIdFromKey
      ? {
          caseId: threadCase.id,
          caseCode: threadCase.code,
          categoria: threadCase.categoria,
          clientName: threadCase.client.fullName,
          preview: thread.at(-1)?.body ?? "Canal listo para iniciar conversación.",
          authorId: "",
          type: activeTypeFromKey as CommentType,
          at: thread.at(-1)?.createdAt ?? emptyChannelAt,
          unreadCount: 0,
        }
      : null);
  const activeCaseId = active?.caseId ?? activeCaseIdFromKey ?? null;
  const activeType = active?.type ?? (activeTypeFromKey as CommentType | undefined) ?? null;
  const activeIsInternal = activeType === CommentType.INTERNAL;
  const activeChannelLabel = activeIsInternal ? "Equipo interno" : "Mensaje al cliente";
  const activeHasInternalChannel = Boolean(activeCaseId);
  const activeHasPublicChannel = Boolean(activeCaseId);

  // ── Fetch thread when active conversation changes ──────────────────────
  const loadThread = useCallback(
    async (caseId: string, type: CommentType) => {
      setLoadingThread(true);
      setThreadError(null);
      setThread([]);
      setThreadCase(null);
      try {
        const url = new URL(`/api/admin/mensajeria/threads/${caseId}`, window.location.origin);
        url.searchParams.set("type", type);
        const res = await fetch(url.toString(), { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          setThreadError(data?.error ?? "No se pudo cargar la conversación.");
          return;
        }
        setThread(data.messages ?? []);
        setThreadCase(data.case ?? null);
      } catch (err: any) {
        setThreadError(err?.message ?? "Error de red al cargar la conversación.");
      } finally {
        setLoadingThread(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!activeCaseId || !activeType) return;
    loadThread(activeCaseId, activeType);
  }, [activeCaseId, activeType, loadThread]);

  // ── Realtime subscription (Supabase) ───────────────────────────────────
  useEffect(() => {
    if (!active || supabaseIsPlaceholder) return;
    const channel = supabase.channel(`messenger:${active.caseId}:${active.type}`);
    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: `caseId=eq.${active.caseId}`,
        },
        (payload: any) => {
          const incoming = payload?.new;
          if (!incoming) return;
          if (incoming.type !== active.type) return;
          setThread((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            // Replace optimistic message with same body if found
            const optimisticIdx = prev.findIndex(
              (m) => m.optimistic && m.authorId === incoming.authorId && m.body === incoming.body,
            );
            const incomingMsg: ThreadMessage = {
              id: incoming.id,
              body: incoming.body,
              type: incoming.type,
              createdAt:
                typeof incoming.createdAt === "string"
                  ? incoming.createdAt
                  : new Date(incoming.createdAt).toISOString(),
              authorId: incoming.authorId,
              author: { id: incoming.authorId, fullName: "—", role: "" },
              isMine: incoming.authorId === currentUserId,
            };
            if (optimisticIdx >= 0) {
              const copy = prev.slice();
              copy[optimisticIdx] = { ...incomingMsg, author: prev[optimisticIdx].author };
              return copy;
            }
            return [...prev, incomingMsg];
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeCaseId, activeType, currentUserId, active]);

  // ── Auto-scroll to bottom on new messages ──────────────────────────────
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [thread.length]);

  // Mark conversation read when thread loads (local UI + server-side badge).
  useEffect(() => {
    if (!activeCaseId || !activeType || thread.length === 0) return;
    const last = thread[thread.length - 1];
    markRead(`${activeCaseId}:${activeType}`, last.createdAt);

    let cancelled = false;
    fetch("/api/admin/mensajeria/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId: activeCaseId, type: activeType }),
    })
      .then(() => {
        if (cancelled) return;
        // Refrescar el badge global inmediatamente.
        window.dispatchEvent(new CustomEvent("messenger:unread-changed"));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread, activeCaseId, activeType]);

  // ── Send composer ──────────────────────────────────────────────────────
  async function handleSend(e?: FormEvent) {
    e?.preventDefault();
    if (!active || sending) return;
    const body = composer.trim();
    if (!body) return;

    setComposerError(null);
    setSending(true);

    const tempId = `temp-${Date.now()}`;
    const optimistic: ThreadMessage = {
      id: tempId,
      body,
      type: active.type,
      createdAt: new Date().toISOString(),
      authorId: currentUserId,
      author: { id: currentUserId, fullName: session?.user?.name ?? "Yo", role: session?.user?.role ?? "" },
      isMine: true,
      optimistic: true,
    };
    setThread((prev) => [...prev, optimistic]);
    setComposer("");

    try {
      const res = await postComment({ caseId: active.caseId, body, type: active.type });
      if (!res.ok) {
        setThread((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, failed: true, optimistic: false } : m)),
        );
        setComposerError(res.reason ?? "No se pudo enviar el mensaje.");
        // Restore body so user doesn't lose what they wrote
        setComposer(body);
        return;
      }
      if (res.comment) {
        const serverComment = res.comment;
        setThread((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? {
                  id: serverComment.id,
                  body: serverComment.body,
                  type: active.type,
                  createdAt:
                    typeof serverComment.createdAt === "string"
                      ? serverComment.createdAt
                      : new Date(serverComment.createdAt).toISOString(),
                  authorId: serverComment.authorId,
                  author: {
                    id: serverComment.authorId,
                    fullName: serverComment.authorName ?? session?.user?.name ?? "Yo",
                    role: session?.user?.role ?? "",
                  },
                  isMine: true,
                }
              : m,
          ),
        );
      }
      // Focus composer for next message
      composerRef.current?.focus();
    } catch (err: any) {
      setThread((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, failed: true, optimistic: false } : m)),
      );
      setComposerError(err?.message ?? "Error de red al enviar el mensaje.");
      setComposer(body);
    } finally {
      setSending(false);
    }
  }

  function onComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function applyConversationFilter(nextFilter: ConversationFilter) {
    setMode("mensajes");
    setFilter(nextFilter);
  }

  function scrollThreadToBottom() {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
    composerRef.current?.focus();
  }

  function selectCaseChannel(type: CommentType) {
    if (!activeCaseId) return;
    const nextKey = `${activeCaseId}:${type}`;
    setMode("mensajes");
    setComposerError(null);
    setSelectedKey(nextKey);
  }

  function applyQuickReply(text: string) {
    setComposer((prev) => {
      const draft = prev.trim();
      return draft ? `${draft}\n\n${text}` : text;
    });
    setComposerError(null);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  async function writeClipboardText(text: string) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (!copied) throw new Error("copy-failed");
  }

  async function copyConversationSummary() {
    if (!active || !threadCase) return;
    const summary = [
      `Caso: ${threadCase.code}`,
      `Cliente: ${threadCase.client.fullName}`,
      `Canal: ${activeChannelLabel}`,
      `Mensajes: ${thread.length}`,
      `Actualizado: ${exactTime(active.at)}`,
      active.preview ? `Ultimo movimiento: ${active.preview}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await writeClipboardText(summary);
      setCopiedSummary(true);
      window.setTimeout(() => setCopiedSummary(false), 1600);
    } catch {
      setComposerError("No se pudo copiar el resumen al portapapeles.");
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────
  const internalCount = conversations.filter((c) => c.type === CommentType.INTERNAL).length;
  const publicCount = conversations.filter((c) => c.type === CommentType.PUBLIC).length;
  const caseCount = new Set(conversations.map((c) => c.caseId)).size;

  const selectedMemberData =
    teamMembers.find((m) => m.id === selectedMember) ?? filteredTeamMembers[0] ?? teamMembers[0] ?? null;

  const quickReplies = useMemo(() => {
    if (!threadCase) return [];
    const code = threadCase.code;
    if (activeIsInternal) {
      return [
        { label: "Pedir apoyo", text: `Equipo, necesito apoyo con el caso ${code}: ` },
        { label: "Actualizar estado", text: `Actualizo estado interno del caso ${code}: ` },
        { label: "Revisar antecedente", text: `Favor revisar antecedente pendiente del caso ${code}.` },
      ];
    }
    return [
      { label: "Estado", text: "Hola, estamos revisando el avance de su caso y le compartiremos novedades apenas estén confirmadas." },
      { label: "Documento", text: "Hola, para avanzar necesitamos que nos envíe el antecedente pendiente por este mismo canal." },
      { label: "Agenda", text: "Hola, podemos coordinar una revisión de su caso. Indíquenos por favor un horario disponible." },
    ];
  }, [activeIsInternal, threadCase]);

  // ── Group messages by day for separator rendering ──────────────────────
  const groupedThread = useMemo(() => {
    const out: Array<{ kind: "sep"; label: string; key: string } | { kind: "msg"; m: ThreadMessage }> = [];
    let lastDate = "";
    for (const m of thread) {
      const dateKey = new Date(m.createdAt).toDateString();
      if (dateKey !== lastDate) {
        out.push({ kind: "sep", label: dayLabel(m.createdAt), key: `sep-${dateKey}` });
        lastDate = dateKey;
      }
      out.push({ kind: "msg", m });
    }
    return out;
  }, [thread]);

  const shellClassName = expanded
    ? "fixed inset-0 z-[80] flex h-[100dvh] bg-[rgba(8,12,24,0.78)] p-2 backdrop-blur-xl sm:p-4"
    : "relative";
  const frameClassName = [
    "relative flex w-full min-h-0 flex-col overflow-hidden border border-[var(--border-glass)] bg-[var(--surface)]",
    expanded
      ? "h-full rounded-[20px] shadow-[0_28px_90px_rgba(2,6,23,0.34)]"
      : "min-h-[calc(100vh-8rem)] rounded-[24px] shadow-[0_28px_80px_rgba(15,23,42,0.14)]",
  ].join(" ");
  const headerClassName = [
    "shrink-0 border-b border-[var(--border-glass)] bg-[linear-gradient(135deg,var(--surface)_0%,var(--surface-2)_58%,var(--blue-dim)_100%)] px-4 py-4 sm:px-6",
    expanded ? "lg:px-7" : "",
  ].join(" ");
  const showInsightPanel = expanded && mode === "mensajes" && Boolean(active && threadCase);
  const layoutClassName = [
    "grid min-h-0 flex-1",
    showInsightPanel
      ? "lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] xl:grid-cols-[minmax(300px,380px)_minmax(0,1fr)_minmax(260px,320px)]"
      : expanded
      ? "lg:grid-cols-[minmax(300px,390px)_minmax(0,1fr)]"
      : "lg:grid-cols-[340px_minmax(0,1fr)]",
  ].join(" ");
  const sidebarScrollClassName = expanded
    ? "max-h-[42dvh] lg:max-h-[calc(100dvh-17.5rem)]"
    : "max-h-[58vh] lg:max-h-[calc(100vh-19rem)]";
  const threadStackClassName = [
    "mx-auto flex flex-col gap-3",
    expanded ? "max-w-5xl" : "max-w-4xl",
  ].join(" ");

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className={shellClassName}>
      <div
        className={frameClassName}
        data-expanded={expanded ? "true" : "false"}
        role={expanded ? "dialog" : undefined}
        aria-modal={expanded ? true : undefined}
        aria-label="Centro de mensajería"
      >
        {/* ── Header bar ─────────────────────────────────────────────── */}
        <div className={headerClassName}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 max-w-4xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-[var(--card-border)] bg-[var(--surface)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  <Sparkles className="h-3 w-3 text-[var(--gold)]" />
                  Centro 2.0
                </span>
                <span className="rounded-full border border-[var(--card-border)] bg-[var(--surface-3)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  {expanded ? "Pantalla completa" : "Modo operativo"}
                </span>
              </div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">
                Centro de mensajería
              </h1>
              <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                Gestiona conversaciones, seguimiento interno y respuestas al cliente desde una vista amplia, clara y en tiempo real.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <StatChip label="Casos" value={caseCount} active={filter === "all"} onClick={() => applyConversationFilter("all")} />
              <StatChip label="Internas" value={internalCount} active={filter === "internal"} onClick={() => applyConversationFilter("internal")} />
              <StatChip label="Cliente" value={publicCount} active={filter === "public"} onClick={() => applyConversationFilter("public")} />
              <StatChip label="Sin leer" value={unreadTotal} accent={unreadTotal > 0} active={filter === "unread"} onClick={() => applyConversationFilter("unread")} />
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className={[expanded ? "btn-dark" : "btn-primary", "px-3 py-2 text-[11px]"].join(" ")}
                title={expanded ? "Contraer pantalla completa" : "Expandir a pantalla completa"}
                aria-pressed={expanded}
              >
                {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                {expanded ? "Contraer" : "Expandir"}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ModeButton
              active={mode === "mensajes"}
              icon={MessageSquare}
              label="Mensajes"
              onClick={() => setMode("mensajes")}
            />
            <ModeButton
              active={mode === "equipo"}
              icon={Users}
              label="Equipo"
              onClick={() => setMode("equipo")}
            />
            <div className="ml-auto hidden items-center gap-2 rounded-full border border-[var(--card-border)] bg-[var(--surface)] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)] lg:flex">
              <kbd className="rounded border border-[var(--card-border)] bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px]">Enter</kbd>
              <span>enviar</span>
              <span className="text-[var(--text-dim)]">·</span>
              <kbd className="rounded border border-[var(--card-border)] bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px]">Shift + Enter</kbd>
              <span>nueva línea</span>
            </div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            <SignalCard
              icon={Bell}
              label="Prioridad"
              value={`${unreadTotal} sin leer`}
              accent={unreadTotal > 0}
              onClick={() => applyConversationFilter("unread")}
            />
            <SignalCard
              icon={MessageSquare}
              label="Canales activos"
              value={`${internalCount} internos · ${publicCount} cliente`}
              onClick={() => applyConversationFilter("all")}
            />
            <SignalCard
              icon={Users}
              label="Equipo conectado"
              value={`${onlineCount} en línea`}
              onClick={() => {
                setMode("equipo");
                setQuery("");
              }}
            />
          </div>
        </div>

        <div className={layoutClassName}>
          {/* ── Sidebar (conversation list / team) ──────────────────── */}
          <aside className="flex min-h-0 flex-col border-b border-[var(--border-glass)] bg-[linear-gradient(180deg,var(--surface-2)_0%,var(--surface)_100%)] lg:border-b-0 lg:border-r">
            <div className="border-b border-[var(--border-glass)] px-4 py-4 space-y-3">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                  aria-hidden
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={mode === "mensajes" ? "Buscar caso, cliente o contenido..." : "Buscar integrante, correo o teléfono..."}
                  className="form-input pl-10 pr-10"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--btn-ghost-hover)] hover:text-[var(--text)]"
                    aria-label="Limpiar búsqueda"
                    title="Limpiar búsqueda"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {mode === "mensajes" && (
                <div className="flex flex-wrap gap-1.5">
                  <FilterChip active={filter === "all"} onClick={() => applyConversationFilter("all")} label="Todas" />
                  <FilterChip
                    active={filter === "unread"}
                    onClick={() => applyConversationFilter("unread")}
                    label={`Sin leer${unreadTotal > 0 ? ` (${unreadTotal})` : ""}`}
                    tone="red"
                  />
                  <FilterChip
                    active={filter === "internal"}
                    onClick={() => applyConversationFilter("internal")}
                    label="Internas"
                  />
                  <FilterChip
                    active={filter === "public"}
                    onClick={() => applyConversationFilter("public")}
                    label="Cliente"
                  />
                </div>
              )}
            </div>

            {mode === "mensajes" ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Filter className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                      Conversaciones
                    </span>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {filteredConversations.length}
                  </span>
                </div>

                <div className={["flex-1 space-y-2 overflow-y-auto p-3", sidebarScrollClassName].join(" ")}>
                  {filteredConversations.length === 0 ? (
                    <EmptyHint
                      icon={MessageSquare}
                      title="Sin conversaciones"
                      body={
                        filter !== "all"
                          ? "Cambia el filtro o limpia la búsqueda para ver más."
                          : "Cuando alguien escriba en un caso, aparecerá aquí."
                      }
                    />
                  ) : (
                    filteredConversations.map((c) => {
                      const key = `${c.caseId}:${c.type}`;
                      const isActive = activeKey === key;
                      const isPinned = pinned.has(key);
                      const lastRead = readMarks[key];
                      const unread =
                        !isActive &&
                        c.authorId !== currentUserId &&
                        (!lastRead || new Date(c.at).getTime() > new Date(lastRead).getTime());
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setSelectedKey(key)}
                          className={[
                            "group relative w-full overflow-hidden rounded-2xl border px-3.5 py-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5",
                            isActive
                              ? "text-white"
                              : unread
                              ? "bg-[var(--surface)]"
                              : "bg-[var(--surface)] hover:bg-[var(--row-hover)]",
                          ].join(" ")}
                          style={
                            isActive
                              ? {
                                  background:
                                    "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
                                  borderColor: "var(--gold-border)",
                                  boxShadow: "0 16px 34px -22px rgba(38,35,92,0.85)",
                                }
                              : {
                                  borderColor: unread ? "var(--gold-border)" : "var(--card-border)",
                                }
                          }
                        >
                          {unread && !isActive && (
                            <span
                              className="absolute left-0 top-4 h-9 w-1 rounded-r-full"
                              style={{ background: "var(--gold)" }}
                              aria-hidden
                            />
                          )}
                          <div className="flex items-start gap-3">
                            <div
                              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-[12px] font-bold shadow-sm"
                              style={{
                                background: isActive
                                  ? "rgba(255,255,255,0.12)"
                                  : c.type === CommentType.INTERNAL
                                  ? "var(--surface-3)"
                                  : "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
                                borderColor: isActive ? "rgba(255,255,255,0.22)" : "var(--card-border)",
                                color: isActive || c.type !== CommentType.INTERNAL ? "#FFFFFF" : "var(--text)",
                              }}
                              aria-hidden
                            >
                              {initialsOf(c.clientName)}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className={["truncate text-sm font-semibold", isActive ? "text-white" : "text-[var(--text)]"].join(" ")}>
                                      {c.clientName}
                                    </span>
                                    {isPinned && (
                                      <Pin
                                        className="h-3 w-3 shrink-0 fill-current"
                                        style={{ color: "var(--gold)" }}
                                        aria-hidden
                                      />
                                    )}
                                  </div>
                                  <div className={["mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em]", isActive ? "text-white/70" : "text-[var(--text-muted)]"].join(" ")}>
                                    <span className="font-mono">{c.caseCode}</span>
                                    <span>·</span>
                                    <span
                                      className="inline-flex items-center gap-1"
                                      style={{
                                        color:
                                          isActive
                                            ? "rgba(255,255,255,0.75)"
                                            : c.type === CommentType.INTERNAL
                                            ? "var(--text-muted)"
                                            : "var(--blue)",
                                      }}
                                    >
                                      {c.type === CommentType.INTERNAL ? (
                                        <Shield className="h-2.5 w-2.5" />
                                      ) : (
                                        <Mail className="h-2.5 w-2.5" />
                                      )}
                                  {c.type === CommentType.INTERNAL ? "Interno" : "Cliente"}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                  <span
                                    className="text-[10px]"
                                    title={exactTime(c.at)}
                                    style={{ color: isActive ? "rgba(255,255,255,0.72)" : "var(--text-muted)" }}
                                  >
                                    {relativeTime(c.at)}
                                  </span>
                                  {unread && (
                                    <span
                                      className="rounded-full px-2 py-0.5 text-[9px] font-bold"
                                      style={{
                                        background: isActive ? "rgba(255,255,255,0.16)" : "var(--gold)",
                                        color: isActive ? "#FFFFFF" : "#1F2A44",
                                      }}
                                      aria-label="Sin leer"
                                    >
                                      {Math.max(c.unreadCount, 1)}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <p
                                className={[
                                  "mt-1.5 line-clamp-2 text-xs leading-5",
                                  isActive
                                    ? "text-white/80"
                                    : unread
                                    ? "text-[var(--text)] font-medium"
                                    : "text-[var(--text-muted)]",
                                ].join(" ")}
                              >
                                {c.preview}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <TeamList
                teamMembers={filteredTeamMembers}
                selectedMember={selectedMember}
                setSelectedMember={setSelectedMember}
                onlineCount={onlineCount}
                query={query}
                listClassName={sidebarScrollClassName}
              />
            )}
          </aside>

          {/* ── Main panel ─────────────────────────────────────────── */}
          <section className="flex min-h-0 flex-col bg-[var(--surface)]">
            {mode === "mensajes" ? (
              active && threadCase ? (
                <div className="flex h-full min-h-0 flex-col">
                  {/* Conversation header */}
                  <div className="flex items-start justify-between gap-3 border-b border-[var(--card-border)] bg-[var(--surface)] px-5 py-4 shadow-sm sm:px-6">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-xl font-bold text-[var(--text)]">
                          {threadCase.client.fullName}
                        </h2>
                        <CategoryBadge category={threadCase.categoria} />
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]"
                          style={{
                            background:
                              active.type === CommentType.INTERNAL
                                ? "var(--surface-3)"
                                : "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
                            borderColor:
                              active.type === CommentType.INTERNAL
                                ? "var(--card-border)"
                                : "var(--gold-border)",
                            color:
                              active.type === CommentType.INTERNAL
                                ? "var(--text-muted)"
                                : "#FFFFFF",
                          }}
                        >
                          {active.type === CommentType.INTERNAL ? (
                            <Shield className="h-3 w-3" />
                          ) : (
                            <Mail className="h-3 w-3" />
                          )}
                          {activeChannelLabel}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                        <span className="font-mono">{threadCase.code}</span>
                        <span>·</span>
                        <span>{thread.length} mensaje{thread.length === 1 ? "" : "s"}</span>
                        <span>·</span>
                        <span title={exactTime(active.at)}>actualizado {relativeTime(active.at)}</span>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        <MiniMetric
                          label="Canal"
                          value={activeChannelLabel}
                          onClick={() => selectCaseChannel(activeIsInternal ? CommentType.PUBLIC : CommentType.INTERNAL)}
                          title="Cambiar canal"
                        />
                        <MiniMetric label="Etapa" value={threadCase.stage} href={`/admin/casos/${active.caseId}`} />
                        <MiniMetric
                          label="Mensajes"
                          value={thread.length}
                          onClick={scrollThreadToBottom}
                          title="Ir al último mensaje"
                        />
                        <MiniMetric
                          label="Estado"
                          value={loadingThread ? "Sincronizando" : "Al día"}
                          onClick={() => loadThread(active.caseId, active.type)}
                          title="Refrescar conversación"
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <ChannelButton
                          active={!activeIsInternal}
                          disabled={!activeHasPublicChannel}
                          icon={Mail}
                          label="Cliente"
                          onClick={() => selectCaseChannel(CommentType.PUBLIC)}
                        />
                        <ChannelButton
                          active={activeIsInternal}
                          disabled={!activeHasInternalChannel}
                          icon={Shield}
                          label="Equipo"
                          onClick={() => selectCaseChannel(CommentType.INTERNAL)}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => togglePinned(activeKey!)}
                        className="btn-ghost px-2.5 py-2"
                        title={pinned.has(activeKey!) ? "Quitar de fijados" : "Fijar conversación"}
                        aria-label={pinned.has(activeKey!) ? "Quitar de fijados" : "Fijar conversación"}
                        aria-pressed={pinned.has(activeKey!)}
                      >
                        <Pin
                          className={["h-4 w-4", pinned.has(activeKey!) ? "fill-current" : ""].join(" ")}
                          style={{ color: pinned.has(activeKey!) ? "var(--gold)" : "var(--text-muted)" }}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => loadThread(active.caseId, active.type)}
                        className="btn-ghost px-2.5 py-2"
                        title="Refrescar conversación"
                        aria-label="Refrescar conversación"
                        disabled={loadingThread}
                      >
                        <RefreshCw
                          className={["h-4 w-4", loadingThread ? "animate-spin" : ""].join(" ")}
                          style={{ color: "var(--text-muted)" }}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={copyConversationSummary}
                        className="btn-ghost px-2.5 py-2"
                        title={copiedSummary ? "Resumen copiado" : "Copiar resumen del caso"}
                        aria-label={copiedSummary ? "Resumen copiado" : "Copiar resumen del caso"}
                      >
                        {copiedSummary ? (
                          <ClipboardCheck className="h-4 w-4 text-[var(--green)]" />
                        ) : (
                          <Copy className="h-4 w-4 text-[var(--text-muted)]" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={scrollThreadToBottom}
                        className="btn-ghost px-2.5 py-2"
                        title="Ir al último mensaje"
                        aria-label="Ir al último mensaje"
                        disabled={thread.length === 0}
                      >
                        <ArrowDownToLine className="h-4 w-4 text-[var(--text-muted)]" />
                      </button>
                      <Link
                        href={`/admin/casos/${active.caseId}`}
                        className="btn-secondary px-3 py-2 text-[11px]"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Abrir caso
                      </Link>
                    </div>
                  </div>

                  {/* Thread */}
                  <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto px-5 py-6 sm:px-6"
                    style={{
                      backgroundColor: "var(--surface-2)",
                      backgroundImage:
                        "linear-gradient(180deg, var(--surface-2) 0%, var(--surface) 100%), linear-gradient(90deg, rgba(37,99,235,0.045) 1px, transparent 1px), linear-gradient(180deg, rgba(217,162,27,0.045) 1px, transparent 1px)",
                      backgroundSize: "auto, 28px 28px, 28px 28px",
                    }}
                  >
                    {threadError ? (
                      <div className="mx-auto max-w-md">
                        <div
                          className="flex items-start gap-2 rounded-xl border px-4 py-3 text-sm"
                          style={{
                            background: "var(--red-dim)",
                            borderColor: "var(--red-border)",
                            color: "var(--red)",
                          }}
                          role="alert"
                        >
                          {threadError}
                        </div>
                        <button
                          type="button"
                          onClick={() => loadThread(active.caseId, active.type)}
                          className="btn-secondary mt-3"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Reintentar
                        </button>
                      </div>
                    ) : loadingThread && thread.length === 0 ? (
                      <div className={threadStackClassName}>
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className={i % 2 === 0 ? "self-start" : "self-end"}
                          >
                            <div
                              className="skeleton h-16 w-72 rounded-2xl"
                              aria-hidden
                            />
                          </div>
                        ))}
                      </div>
                    ) : thread.length === 0 ? (
                      <div className="mx-auto max-w-md text-center text-sm text-[var(--text-muted)]">
                        Aún no hay mensajes en este canal. Sé el primero en escribir.
                      </div>
                    ) : (
                      <div className={threadStackClassName}>
                        {groupedThread.map((item) =>
                          item.kind === "sep" ? (
                            <div key={item.key} className="my-2 flex items-center justify-center gap-3">
                              <span className="h-px flex-1 max-w-[80px]" style={{ background: "var(--card-border)" }} />
                              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                                {item.label}
                              </span>
                              <span className="h-px flex-1 max-w-[80px]" style={{ background: "var(--card-border)" }} />
                            </div>
                          ) : (
                            <MessageBubble
                              key={item.m.id}
                              m={item.m}
                              isInternal={active.type === CommentType.INTERNAL}
                            />
                          ),
                        )}
                      </div>
                    )}
                  </div>

                  {/* Composer */}
                  <form
                    onSubmit={handleSend}
                    className="shrink-0 border-t border-[var(--card-border)] bg-[linear-gradient(180deg,var(--surface)_0%,var(--surface-2)_100%)] px-5 py-4 shadow-[0_-16px_38px_rgba(15,23,42,0.06)] sm:px-6"
                  >
                    {quickReplies.length > 0 && (
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                          <Zap className="h-3 w-3 text-[var(--gold)]" />
                          Respuestas rápidas
                        </span>
                        {quickReplies.map((reply) => (
                          <button
                            key={reply.label}
                            type="button"
                            onClick={() => applyQuickReply(reply.text)}
                            className="rounded-full border border-[var(--card-border)] bg-[var(--surface-2)] px-3 py-1 text-[10px] font-semibold text-[var(--text)] transition-colors hover:border-[var(--gold-border)] hover:bg-[var(--gold-dim)]"
                          >
                            {reply.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {composerError && (
                      <div
                        className="mb-2 rounded-lg border px-3 py-2 text-xs"
                        style={{
                          background: "var(--red-dim)",
                          borderColor: "var(--red-border)",
                          color: "var(--red)",
                        }}
                        role="alert"
                      >
                        {composerError}
                      </div>
                    )}
                    <div
                      className="flex items-end gap-2 rounded-[22px] border px-3 py-2 shadow-sm transition-all focus-within:-translate-y-0.5 focus-within:shadow-[0_0_0_3px_var(--gold-dim),0_18px_36px_-24px_rgba(15,23,42,0.45)]"
                      style={{
                        background: "var(--surface)",
                        borderColor: "var(--card-border)",
                      }}
                    >
                      <textarea
                        ref={composerRef}
                        value={composer}
                        onChange={(e) => setComposer(e.target.value.slice(0, MAX_BODY_CHARS))}
                        onKeyDown={onComposerKey}
                        placeholder={
                          activeIsInternal
                            ? "Mensaje al equipo (no visible para el cliente)…"
                            : "Mensaje al cliente — quedará en su portal y se notificará por WhatsApp/Email."
                        }
                        rows={1}
                        className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-[var(--text-dim)]"
                        style={{
                          color: "var(--text)",
                          maxHeight: 160,
                          minHeight: 28,
                        }}
                        disabled={sending}
                      />
                      <button
                        type="submit"
                        disabled={!composer.trim() || sending}
                        className="btn-primary text-[11px] px-4 py-2"
                        title="Enviar mensaje (Enter)"
                      >
                        {sending ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Enviando…
                          </>
                        ) : (
                          <>
                            <Send className="h-3.5 w-3.5" />
                            Enviar
                          </>
                        )}
                      </button>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--text-muted)]">
                      <span>
                        {activeIsInternal ? (
                          <>
                            <Shield className="inline h-2.5 w-2.5 mr-1" />
                            Solo equipo · queda en bitácora del caso
                          </>
                        ) : (
                          <>
                            <Bell className="inline h-2.5 w-2.5 mr-1" />
                            Se notifica al cliente vía WhatsApp + Email
                          </>
                        )}
                      </span>
                      <span>
                        {composer.length}/{MAX_BODY_CHARS}
                      </span>
                    </div>
                  </form>
                </div>
              ) : (
                <EmptyPanel
                  title="Sin conversación seleccionada"
                  body="Elige una conversación de la izquierda para ver el thread completo y responder en tiempo real."
                />
              )
            ) : selectedMemberData ? (
              <TeamPanel member={selectedMemberData} />
            ) : (
              <EmptyPanel
                title="Sin miembro seleccionado"
                body="Selecciona un integrante del equipo desde la columna izquierda."
              />
            )}
          </section>
          {showInsightPanel && active && threadCase && (
            <aside className="hidden min-h-0 flex-col border-l border-[var(--border-glass)] bg-[var(--surface-2)] xl:flex">
              <div className="border-b border-[var(--border-glass)] px-5 py-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Panel operativo
                </p>
                <h3 className="mt-1 text-lg font-bold text-[var(--text)]">{threadCase.client.fullName}</h3>
                <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">{threadCase.code}</p>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface)] p-4 shadow-sm">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Estado del canal
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    <SummaryRow label="Canal" value={activeChannelLabel} />
                    <SummaryRow label="Mensajes" value={thread.length} />
                    <SummaryRow label="Última actividad" value={relativeTime(active.at)} />
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface)] p-4 shadow-sm">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Acciones
                  </div>
                  <div className="mt-3 grid gap-2">
                    <button type="button" onClick={copyConversationSummary} className="btn-secondary justify-center text-[11px]">
                      {copiedSummary ? <ClipboardCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedSummary ? "Resumen copiado" : "Copiar resumen"}
                    </button>
                    <button type="button" onClick={scrollThreadToBottom} className="btn-secondary justify-center text-[11px]">
                      <ArrowDownToLine className="h-3.5 w-3.5" />
                      Último mensaje
                    </button>
                    <Link href={`/admin/casos/${active.caseId}`} className="btn-primary justify-center text-[11px]">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Abrir caso
                    </Link>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface)] p-4 shadow-sm">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Canales disponibles
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ChannelButton
                      active={!activeIsInternal}
                      disabled={!activeHasPublicChannel}
                      icon={Mail}
                      label="Cliente"
                      onClick={() => selectCaseChannel(CommentType.PUBLIC)}
                    />
                    <ChannelButton
                      active={activeIsInternal}
                      disabled={!activeHasInternalChannel}
                      icon={Shield}
                      label="Equipo"
                      onClick={() => selectCaseChannel(CommentType.INTERNAL)}
                    />
                  </div>
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────
function MessageBubble({ m, isInternal }: { m: ThreadMessage; isInternal: boolean }) {
  const audio = parseAudioMessage(m.body);
  return (
    <div className={["flex items-end gap-2", m.isMine ? "justify-end" : "justify-start"].join(" ")}>
      {!m.isMine && (
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[10px] font-bold shadow-sm"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--card-border)",
            color: "var(--text)",
          }}
          aria-hidden
        >
          {initialsOf(m.author.fullName || "Miembro")}
        </div>
      )}
      <div
        className={[
          "max-w-[min(82%,760px)] rounded-[24px] border px-4 py-3 shadow-md transition-all",
          m.optimistic ? "opacity-70" : "",
          m.isMine ? "rounded-br-lg" : "rounded-bl-lg",
        ].join(" ")}
        style={
          m.isMine
            ? {
                background: isInternal
                  ? "linear-gradient(180deg, var(--bg) 0%, var(--bg-deep) 100%)"
                  : "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
                color: "#FFFFFF",
                borderColor: "rgba(255,255,255,0.12)",
                boxShadow: "0 18px 34px -24px rgba(15,23,42,0.7)",
              }
            : {
                background: "var(--surface)",
                color: "var(--text)",
                borderColor: "var(--card-border)",
                boxShadow: "0 12px 28px -24px rgba(15,23,42,0.45)",
              }
        }
      >
        {!m.isMine && (
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span
              className="text-[10px] font-bold uppercase tracking-[0.16em]"
              style={{ color: "var(--text-muted)" }}
            >
              {m.author.fullName || "Miembro"}
            </span>
            {isInternal && (
              <span
                className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]"
                style={{ background: "var(--surface-3)", color: "var(--text-muted)" }}
              >
                Interno
              </span>
            )}
          </div>
        )}
        {audio ? (
          <audio controls preload="metadata" src={audio.url} className="mt-1 w-full max-w-[280px]" />
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm leading-6">{m.body}</p>
        )}
        <div
          className={[
            "mt-1.5 flex items-center justify-end gap-1 text-[10px]",
            m.isMine ? "opacity-80" : "",
          ].join(" ")}
          style={{
            color: m.isMine ? "rgba(255,255,255,0.85)" : "var(--text-muted)",
          }}
          title={exactTime(m.createdAt)}
        >
          <span>{new Date(m.createdAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</span>
          {m.isMine && !m.optimistic && !m.failed && <CheckCheck className="h-3 w-3" />}
          {m.isMine && m.optimistic && !m.failed && <Check className="h-3 w-3" />}
          {m.failed && <span style={{ color: "var(--red)" }}>· falló</span>}
        </div>
      </div>
    </div>
  );
}

function TeamList({
  teamMembers,
  selectedMember,
  setSelectedMember,
  onlineCount,
  query,
  listClassName,
}: {
  teamMembers: TeamMember[];
  selectedMember: string | null;
  setSelectedMember: (id: string) => void;
  onlineCount: number;
  query: string;
  listClassName: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            Equipo
          </span>
        </div>
        <span className="text-[10px] text-[var(--text-muted)]">{onlineCount} en línea</span>
      </div>

      <div className={["flex-1 space-y-2 overflow-y-auto p-3", listClassName].join(" ")}>
        {teamMembers.length === 0 ? (
          <EmptyHint
            icon={Users}
            title={query ? "Sin resultados" : "Sin miembros"}
            body={query ? "Limpia la búsqueda o prueba con otro nombre, correo o teléfono." : "No hay integrantes registrados."}
          />
        ) : (
          teamMembers.map((m) => {
            const online = isOnline(m.lastSeenAt ? new Date(m.lastSeenAt) : null);
            const active = selectedMember === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMember(m.id)}
                className={[
                  "w-full rounded-2xl border px-3.5 py-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5",
                  active ? "text-white" : "bg-[var(--surface)] hover:bg-[var(--row-hover)]",
                ].join(" ")}
                style={
                  active
                    ? {
                        background:
                          "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
                        borderColor: "var(--gold-border)",
                      }
                    : { borderColor: "var(--card-border)" }
                }
              >
                <div className="flex items-start gap-3">
                  <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-[12px] font-bold text-white shadow-sm"
                    style={{ background: active ? "rgba(255,255,255,0.12)" : "linear-gradient(135deg, var(--bg) 0%, var(--bg-deep) 100%)" }}
                  >
                    {initialsOf(m.fullName)}
                    <span
                      className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2"
                      style={{
                        background: online ? "#10B981" : "#94A3B8",
                        borderColor: "var(--surface)",
                      }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className={["truncate text-sm font-semibold", active ? "text-white" : "text-[var(--text)]"].join(" ")}>
                          {m.fullName}
                        </div>
                        <div className={["mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em]", active ? "text-white/70" : "text-[var(--text-muted)]"].join(" ")}>
                          {m.role === Role.JEFE_DE_MESA ? (
                            <>
                              <Crown className="h-3 w-3" style={{ color: "var(--gold)" }} />
                              Jefe de grupo
                            </>
                          ) : (
                            <>
                              <Scale className="h-3 w-3" style={{ color: "var(--blue)" }} />
                              Abogado
                            </>
                          )}
                        </div>
                      </div>
                      <span className={["text-[10px]", active ? "text-white/70" : "text-[var(--text-muted)]"].join(" ")}>{m.caseCount} casos</span>
                    </div>
                    <div className={["mt-1 text-[10px]", active ? "text-white/65" : "text-[var(--text-muted)]"].join(" ")}>
                      {online ? "En línea ahora" : "Desconectado"}
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function TeamPanel({ member }: { member: TeamMember }) {
  const online = isOnline(member.lastSeenAt ? new Date(member.lastSeenAt) : null);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--card-border)] px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-bold text-[var(--text)]">{member.fullName}</h2>
            <span
              className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]"
              style={{
                background: "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
                borderColor: "var(--gold-border)",
                color: "#FFFFFF",
              }}
            >
              {member.role === Role.JEFE_DE_MESA ? "Jefe de grupo" : "Abogado"}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
            <span>{member.email || "Sin correo"}</span>
            <span>·</span>
            <span>{member.phone || "Sin teléfono"}</span>
          </div>
        </div>
        <div
          className="rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
          style={
            online
              ? { background: "var(--green-dim)", borderColor: "var(--green-border)", color: "var(--green)" }
              : { background: "var(--surface-3)", borderColor: "var(--card-border)", color: "var(--text-muted)" }
          }
        >
          {online ? "En línea" : "Desconectado"}
        </div>
      </div>

      <div className="grid flex-1 gap-5 p-5 sm:p-6 xl:grid-cols-[1fr_320px]">
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Acceso rápido
            </h3>
            <span className="rounded-full bg-[var(--surface-3)] px-2.5 py-1 text-[10px] font-semibold text-[var(--text-muted)]">
              {member.caseCount} casos
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/admin/mensajeria/equipo/${member.id}`}
              className="btn-primary px-4 py-2.5 text-[11px]"
            >
              Abrir chat 1:1
            </Link>
            {buildWhatsAppLink(member.phone, member.fullName) && (
              <a
                href={buildWhatsAppLink(member.phone, member.fullName) ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-dark px-4 py-2.5 text-[11px]"
              >
                WhatsApp
              </a>
            )}
            {member.email && (
              <a
                href={`mailto:${member.email}?subject=${encodeURIComponent("HIVE CONTROL · Coordinación")}`}
                className="btn-secondary px-4 py-2.5 text-[11px]"
              >
                Email
              </a>
            )}
          </div>

          <div
            className="mt-6 rounded-xl p-4"
            style={{ background: "var(--surface-3)", border: "1px solid var(--card-border)" }}
          >
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              <Clock3 className="h-4 w-4" />
              Estado operativo
            </div>
            <div className="mt-3 grid gap-2 text-sm text-[var(--text-muted)]">
              <SummaryRow label="Casos asignados" value={member.caseCount} />
              <SummaryRow label="Presencia activa" value={online ? "Sí" : "No"} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface)] p-5 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
            Contacto
          </h3>
          <div className="mt-4 space-y-3 text-sm">
            <InfoRow icon={Mail} label="Correo" value={member.email || "No disponible"} />
            <InfoRow icon={Phone} label="Teléfono" value={member.phone || "No disponible"} />
            <InfoRow
              icon={Scale}
              label="Rol"
              value={member.role === Role.JEFE_DE_MESA ? "Jefe de grupo" : "Abogado"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  const buttonStyle = active
    ? {
        background: "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
        borderColor: "var(--gold-border)",
        color: "#FFFFFF",
        boxShadow: "0 10px 22px -14px rgba(38, 35, 92, 0.8)",
      }
    : {
        background: "var(--surface)",
        borderColor: "var(--card-border)",
        color: "var(--text)",
      };

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] transition-all hover:-translate-y-0.5"
      style={buttonStyle}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function FilterChip({
  active,
  label,
  onClick,
  tone,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  tone?: "red";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors",
      ].join(" ")}
      style={
        active
          ? {
              background: tone === "red" ? "var(--red-dim)" : "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
              borderColor: tone === "red" ? "var(--red-border)" : "var(--gold-border)",
              color: tone === "red" ? "var(--red)" : "#FFFFFF",
            }
          : {
              background: "var(--surface)",
              borderColor: "var(--card-border)",
              color: "var(--text-muted)",
            }
      }
    >
      {label}
    </button>
  );
}

function ChannelButton({
  active,
  disabled,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  const buttonStyle = active
    ? {
        background: "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
        borderColor: "var(--gold-border)",
        color: "#FFFFFF",
      }
    : {
        background: "var(--surface)",
        borderColor: "var(--card-border)",
        color: "var(--text)",
      };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className="inline-flex items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
      style={buttonStyle}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

function StatChip({
  label,
  value,
  accent,
  active,
  onClick,
}: {
  label: string;
  value: number;
  accent?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`Filtrar por ${label.toLowerCase()}`}
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition-all hover:-translate-y-0.5"
      style={
        active
          ? {
              background: "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
              borderColor: "var(--gold-border)",
              color: "#FFFFFF",
              boxShadow: "0 10px 24px -16px rgba(38, 35, 92, 0.95)",
            }
          : accent
          ? {
              background: "var(--red-dim)",
              borderColor: "var(--red-border)",
              color: "var(--red)",
            }
          : {
              background: "var(--surface)",
              borderColor: "var(--card-border)",
              color: "var(--text-muted)",
            }
      }
    >
      {label}
      <span
        className="rounded-full px-2 py-0.5"
        style={
          active
            ? { background: "rgba(255,255,255,0.16)", color: "#FFFFFF" }
            : accent
            ? { background: "var(--red)", color: "#FFFFFF" }
            : { background: "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)", color: "#FFFFFF" }
        }
      >
        {value}
      </span>
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div
      className="flex items-center justify-between rounded-lg px-4 py-3 text-sm"
      style={{ background: "var(--surface)", border: "1px solid var(--card-border)" }}
    >
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-semibold text-[var(--text)]">{value}</span>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  href,
  onClick,
  title,
}: {
  label: string;
  value: number | string;
  href?: string;
  onClick?: () => void;
  title?: string;
}) {
  const className = [
    "min-w-0 rounded-xl border px-3 py-2 text-left transition-all",
    href || onClick ? "hover:-translate-y-0.5 hover:border-[var(--gold-border)] hover:bg-[var(--gold-dim)]" : "",
  ].join(" ");
  const style = { background: "var(--surface-2)", borderColor: "var(--card-border)" };
  const content = (
    <>
      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-0.5 truncate text-xs font-semibold text-[var(--text)]">
        {value}
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className} style={style} title={title ?? label}>
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} style={style} title={title ?? label}>
        {content}
      </button>
    );
  }

  return (
    <div className={className} style={style}>
      {content}
    </div>
  );
}

function SignalCard({
  icon: Icon,
  label,
  value,
  accent,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 items-center gap-3 rounded-2xl border px-3.5 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--gold-border)]"
      style={{
        background: accent ? "var(--gold-dim)" : "var(--surface)",
        borderColor: accent ? "var(--gold-border)" : "var(--card-border)",
      }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{
          background: accent
            ? "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)"
            : "var(--surface-3)",
          color: accent ? "#FFFFFF" : "var(--text-muted)",
        }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
          {label}
        </div>
        <div className="mt-0.5 truncate text-xs font-semibold text-[var(--text)]">
          {value}
        </div>
      </div>
    </button>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl px-4 py-3"
      style={{ background: "var(--surface-3)", border: "1px solid var(--card-border)" }}
    >
      <div
        className="mt-0.5 rounded-lg p-2"
        style={{ background: "var(--surface)", border: "1px solid var(--card-border)" }}
      >
        <Icon className="h-4 w-4 text-[var(--text-muted)]" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
          {label}
        </div>
        <div className="mt-1 text-sm text-[var(--text)] break-words">{value}</div>
      </div>
    </div>
  );
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full min-h-[42vh] items-center justify-center p-8 text-center">
      <div className="max-w-md">
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{
            background: "var(--surface-3)",
            border: "1px solid var(--card-border)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <MessageSquare className="h-6 w-6 text-[var(--text-muted)]" />
        </div>
        <h3 className="mt-4 text-lg font-bold text-[var(--text)]">{title}</h3>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{body}</p>
      </div>
    </div>
  );
}

function EmptyHint({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="p-8 text-center">
      <div
        className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl"
        style={{ background: "var(--surface-3)", border: "1px solid var(--card-border)" }}
      >
        <Icon className="h-4 w-4 text-[var(--text-muted)]" />
      </div>
      <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{body}</p>
    </div>
  );
}
