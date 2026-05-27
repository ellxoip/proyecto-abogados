"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  MessageSquare,
  X,
  Send,
  Loader2,
  ChevronLeft,
  Lock,
  Globe,
  Search,
  Inbox,
  Briefcase,
  AlertTriangle,
  Users,
} from "lucide-react";
import { messageNotificationBody, parseAudioMessage, parseFileMessage } from "@/lib/chat-message";
import { postComment } from "@/app/admin/casos/[id]/actions";

/**
 * MessengerDock — dock flotante de mensajería para staff.
 *
 * - Tab "Inbox": casos con mensajes recientes (últimos 14 días).
 * - Tab "Casos": todos los casos en scope, para iniciar conversación nueva
 *   incluso si el caso nunca tuvo mensajes.
 * - Chat panel: mensajes INTERNAL (staff a staff) y PUBLIC (staff a cliente).
 *
 * Robustez:
 *   - Polling cada 8s del thread abierto (live update sin recargar).
 *   - Polling cada 30s de Inbox.
 *   - Optimistic send: el mensaje aparece de inmediato como `pending` y
 *     se confirma cuando el server responde.
 *   - Errores inline (no `alert()`) con CTA de reintento.
 */

type Summary = {
  caseId: string;
  caseCode: string;
  clientName: string;
  body: string;
  authorName: string;
  authorId: string;
  type: "INTERNAL" | "PUBLIC";
  createdAt: string;
  isMine: boolean;
  isUnread?: boolean;
};

type ThreadMessage = {
  id: string;
  body: string;
  type: "INTERNAL" | "PUBLIC";
  createdAt: string;
  authorId: string;
  author: { id: string; fullName: string; role: string };
  isMine: boolean;
};

type ThreadStaffMember = {
  id: string;
  fullName: string;
  role: string;
  email: string;
  lastSeenAt: string | null;
};

type ThreadResponse = {
  ok: boolean;
  case: {
    id: string;
    code: string;
    stage: string;
    client: { id: string; fullName: string; email: string | null };
    categoria: { id: string; name: string } | null;
    staffTeam: ThreadStaffMember[];
  };
  messages: ThreadMessage[];
};

type CaseEntry = {
  id: string;
  code: string;
  stage: string;
  clientName: string;
  clientId: string;
  categoria: string | null;
  abogados: { id: string; fullName: string }[];
  commentCount: number;
};

type OptimisticMessage = {
  tempId: string;
  body: string;
  type: "INTERNAL" | "PUBLIC";
  createdAt: string;
  pending: boolean;
  error?: string;
};

export function MessengerDock() {
  const { data: sessionData, status } = useSession();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"inbox" | "cases">("inbox");
  const [summary, setSummary] = useState<Summary[]>([]);
  const [cases, setCases] = useState<CaseEntry[]>([]);
  const [unread, setUnread] = useState(0);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadResponse | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"PUBLIC" | "INTERNAL">("INTERNAL");
  const [filter, setFilter] = useState("");
  const [optimistic, setOptimistic] = useState<OptimisticMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const authed = status === "authenticated";
  const myUserId = sessionData?.user?.id;
  const visibleOptimistic = optimistic.filter((m) => m.type === messageType);

  // ── Polling Inbox + Cases ─────────────────────────────────────────────
  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/mensajeria/summary", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data?.messages) ? (data.messages as Summary[]) : [];
      setSummary(list);
      const count = Number(data?.unreadCount ?? 0);
      setUnread(count);
      window.dispatchEvent(
        new CustomEvent("messenger:unread-changed", { detail: { unreadCount: count } }),
      );
    } catch {
      // silencio
    }
  }, []);

  const fetchCases = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/mensajeria/cases?limit=100", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setCases(Array.isArray(data?.cases) ? data.cases : []);
    } catch {
      // silencio
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    fetchSummary();
    const poll = setInterval(fetchSummary, 30_000);
    return () => clearInterval(poll);
  }, [authed, fetchSummary]);

  useEffect(() => {
    if (!authed) return;
    if (tab === "cases" && cases.length === 0) fetchCases();
  }, [authed, tab, cases.length, fetchCases]);

  // ── Polling thread cuando está abierto ────────────────────────────────
  const fetchThread = useCallback(
    async (caseId: string, type: "PUBLIC" | "INTERNAL", silent = false) => {
      if (!silent) {
        setLoadingThread(true);
        setThread((prev) => (prev?.case.id === caseId ? { ...prev, messages: [] } : prev));
      }
      try {
        const url = new URL(`/api/admin/mensajeria/threads/${caseId}`, window.location.origin);
        url.searchParams.set("type", type);
        url.searchParams.set("limit", "80");
        const res = await fetch(url.toString(), { cache: "no-store" });
        const data = await res.json();
        if (res.ok) setThread(data as ThreadResponse);
      } finally {
        if (!silent) setLoadingThread(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!selectedCaseId) {
      setThread(null);
      return;
    }
    fetchThread(selectedCaseId, messageType);
    const poll = setInterval(() => fetchThread(selectedCaseId, messageType, true), 8_000);

    // Marcar la conversación como leída en el server. El badge se actualiza
    // en cuanto vuelve la summary; ejecutamos también un refresh inmediato
    // para no esperar el próximo poll de 30s.
    let cancelled = false;
    fetch("/api/admin/mensajeria/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId: selectedCaseId, type: messageType }),
    })
      .then(() => {
        if (cancelled) return;
        fetchSummary();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [selectedCaseId, messageType, fetchThread, fetchSummary]);

  // Auto-scroll al final cuando llegan mensajes nuevos.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thread?.messages.length, visibleOptimistic.length, selectedCaseId, messageType]);

  // Si el thread se refresca y trae el mensaje optimistic ya creado, removerlo.
  useEffect(() => {
    if (!thread || optimistic.length === 0) return;
    setOptimistic((prev) =>
      prev.filter((opt) => {
        if (opt.error) return true;
        return !thread.messages.some(
          (m) => m.body === opt.body && m.type === opt.type && m.authorId === myUserId,
        );
      }),
    );
  }, [thread, myUserId]);

  async function handleSend() {
    if (!selectedCaseId || !draft.trim() || sending) return;
    const body = draft.trim();
    const type = messageType;
    const tempId = `opt-${Date.now()}`;
    const opt: OptimisticMessage = {
      tempId,
      body,
      type,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    setOptimistic((p) => [...p, opt]);
    setDraft("");
    setSendError(null);
    setSending(true);
    try {
      const r = await postComment({ caseId: selectedCaseId, body, type });
      if (r.ok) {
        // Refresh inmediato + summary para actualizar inbox.
        await Promise.all([fetchThread(selectedCaseId, type, true), fetchSummary()]);
        // El cleanup en el useEffect retira el optimistic cuando ya
        // aparece en thread.messages.
      } else {
        setOptimistic((p) =>
          p.map((o) => (o.tempId === tempId ? { ...o, pending: false, error: r.reason } : o)),
        );
        setSendError(r.reason);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error de red al enviar.";
      setOptimistic((p) =>
        p.map((o) => (o.tempId === tempId ? { ...o, pending: false, error: msg } : o)),
      );
      setSendError(msg);
    } finally {
      setSending(false);
    }
  }

  function selectCase(caseId: string, type: "PUBLIC" | "INTERNAL" = "INTERNAL") {
    setMessageType(type);
    setSelectedCaseId(caseId);
    setSendError(null);
    setOptimistic([]);
  }

  if (!authed) return null;

  const filteredSummary = filter
    ? summary.filter(
        (m) =>
          m.caseCode.toLowerCase().includes(filter.toLowerCase()) ||
          m.clientName.toLowerCase().includes(filter.toLowerCase()) ||
          m.body.toLowerCase().includes(filter.toLowerCase()),
      )
    : summary;

  const filteredCases = filter
    ? cases.filter(
        (c) =>
          c.code.toLowerCase().includes(filter.toLowerCase()) ||
          c.clientName.toLowerCase().includes(filter.toLowerCase()),
      )
    : cases;

  return (
    <>
      {/* Botón flotante toggle */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir mensajería"
          className="fixed bottom-24 right-4 z-50 rounded-full p-3 transition-transform hover:scale-105 active:scale-95"
          style={{
            background: "linear-gradient(180deg, var(--gold) 0%, var(--gold-deep) 100%)",
            color: "#0B0C10",
            boxShadow: "0 10px 30px rgba(0,0,0,0.35), 0 0 0 2px rgba(255,255,255,0.04) inset",
          }}
        >
          <MessageSquare className="w-5 h-5" />
          {unread > 0 && (
            <span
              className="absolute -top-1 -right-1 inline-flex items-center justify-center text-[10px] font-bold leading-none rounded-full min-w-[20px] h-[20px] px-1.5"
              style={{
                background: "#DC2626",
                color: "#FFFFFF",
                boxShadow: "0 0 0 2px var(--app-bg, #F4F4F2)",
              }}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      )}

      {open && (
        <div
          className="fixed bottom-4 right-4 z-50 w-[400px] max-w-[calc(100vw-2rem)] flex flex-col rounded-2xl overflow-hidden"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-glass)",
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.4)",
            maxHeight: "calc(100vh - 2rem)",
            height: "680px",
            color: "var(--text)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: "var(--border-glass)", background: "var(--surface-2)" }}
          >
            <div className="flex items-center gap-2 min-w-0">
              {selectedCaseId && (
                <button
                  type="button"
                  onClick={() => setSelectedCaseId(null)}
                  aria-label="Volver"
                  className="p-1 rounded hover:bg-[var(--surface)]"
                  style={{ color: "var(--text-muted)" }}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              <MessageSquare className="w-4 h-4 flex-shrink-0" style={{ color: "var(--gold)" }} />
              <span
                className="text-[11px] font-bold uppercase tracking-widest truncate"
                style={{ color: "var(--text)" }}
              >
                {selectedCaseId && thread
                  ? `${thread.case.code} · ${thread.case.client.fullName}`
                  : "Mensajería"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar"
              className="p-1 rounded hover:bg-[var(--surface)]"
              style={{ color: "var(--text-muted)" }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tabs (solo cuando no hay thread abierto) */}
          {!selectedCaseId && (
            <div
              className="flex border-b"
              style={{ borderColor: "var(--border-glass)", background: "var(--surface)" }}
            >
              <TabButton active={tab === "inbox"} onClick={() => setTab("inbox")}>
                <Inbox className="w-3.5 h-3.5" />
                Inbox {unread > 0 && <Badge>{unread}</Badge>}
              </TabButton>
              <TabButton active={tab === "cases"} onClick={() => setTab("cases")}>
                <Briefcase className="w-3.5 h-3.5" />
                Casos
              </TabButton>
            </div>
          )}

          {/* Body — listas */}
          {!selectedCaseId && (
            <div className="flex-1 flex flex-col min-h-0">
              <div
                className="px-3 py-2 border-b flex items-center gap-2"
                style={{ borderColor: "var(--border-glass)" }}
              >
                <Search className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={
                    tab === "inbox"
                      ? "Filtrar por caso, cliente o texto..."
                      : "Buscar caso o cliente..."
                  }
                  className="flex-1 text-[12px] outline-none bg-transparent"
                  style={{ color: "var(--text)" }}
                />
              </div>
              <div className="flex-1 overflow-y-auto">
                {tab === "inbox" ? (
                  <InboxList items={filteredSummary} totalRaw={summary.length} onSelect={selectCase} />
                ) : (
                  <CasesList
                    items={filteredCases}
                    totalRaw={cases.length}
                    onSelect={selectCase}
                    refresh={fetchCases}
                  />
                )}
              </div>
            </div>
          )}

          {/* Chat panel */}
          {selectedCaseId && (
            <div className="flex-1 flex flex-col min-h-0">
              {thread && <ChannelContext thread={thread} type={messageType} />}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
                {loadingThread && (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-muted)" }} />
                  </div>
                )}
                {!loadingThread && thread && thread.messages.length === 0 && visibleOptimistic.length === 0 && (
                  <div
                    className="text-center text-[12px] py-6"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {messageType === "INTERNAL"
                      ? "Sin mensajes internos en este caso."
                      : "Sin mensajes del cliente en este caso."}
                  </div>
                )}
                {thread?.messages.map((m) => {
                  const audio = parseAudioMessage(m.body);
                  const file = parseFileMessage(m.body);
                  return (
                    <Bubble
                      key={m.id}
                      mine={m.isMine}
                      type={m.type}
                      authorName={m.author.fullName}
                      authorRole={m.author.role}
                      createdAt={m.createdAt}
                    >
                      {audio ? (
                        <audio controls src={audio.url} className="w-full max-w-[240px]" />
                      ) : file ? (
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                          style={{ color: "var(--gold)" }}
                        >
                          📎 {file.name}
                        </a>
                      ) : (
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      )}
                    </Bubble>
                  );
                })}
                {visibleOptimistic.map((m) => (
                  <Bubble
                    key={m.tempId}
                    mine
                    type={m.type}
                    authorName="Tú"
                    authorRole="ABOGADO"
                    createdAt={m.createdAt}
                    pending={m.pending}
                    error={m.error}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  </Bubble>
                ))}
              </div>

              {/* Error inline */}
              {sendError && (
                <div
                  className="px-3 py-2 text-[11px] flex items-start gap-2 border-t"
                  style={{
                    background: "rgba(239,68,68,0.10)",
                    borderColor: "rgba(239,68,68,0.30)",
                    color: "#B91C1C",
                  }}
                >
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">{sendError}</div>
                  <button
                    type="button"
                    onClick={() => setSendError(null)}
                    aria-label="Cerrar error"
                    className="opacity-70 hover:opacity-100"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Composer */}
              <div
                className="border-t p-2 space-y-2"
                style={{ borderColor: "var(--border-glass)", background: "var(--surface-2)" }}
              >
                <div className="flex items-center gap-2 text-[10px]">
                  <TypeToggle
                    label="Interno (staff)"
                    icon={<Lock className="w-3 h-3" />}
                    active={messageType === "INTERNAL"}
                    color="var(--gold)"
                    dim="var(--gold-dim)"
                    onClick={() => {
                      setMessageType("INTERNAL");
                      setSendError(null);
                    }}
                  />
                  <TypeToggle
                    label="Cliente"
                    icon={<Globe className="w-3 h-3" />}
                    active={messageType === "PUBLIC"}
                    color="var(--green)"
                    dim="rgba(34,197,94,0.15)"
                    onClick={() => {
                      setMessageType("PUBLIC");
                      setSendError(null);
                    }}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={
                      messageType === "INTERNAL"
                        ? "Nota interna (staff a staff, oculta al cliente)..."
                        : "Mensaje público para el cliente del caso..."
                    }
                    rows={2}
                    className="flex-1 resize-none text-[12px] p-2 rounded border outline-none focus:border-[var(--gold)]"
                    style={{
                      background: "var(--surface)",
                      borderColor: "var(--border-glass)",
                      color: "var(--text)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending || !draft.trim()}
                    className="p-2 rounded disabled:opacity-40 transition-all"
                    style={{ background: "var(--bg)", color: "var(--gold)" }}
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────
function ChannelContext({
  thread,
  type,
}: {
  thread: ThreadResponse;
  type: "PUBLIC" | "INTERNAL";
}) {
  if (type === "PUBLIC") {
    return (
      <div
        className="border-b px-3 py-2"
        style={{ borderColor: "var(--border-glass)", background: "var(--surface)" }}
      >
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--green)" }}>
          <Globe className="w-3.5 h-3.5" />
          Cliente
        </div>
        <div className="mt-1 truncate text-[12px] font-semibold" style={{ color: "var(--text)" }}>
          {thread.case.client.fullName}
          {thread.case.client.email ? (
            <span className="ml-1 font-normal" style={{ color: "var(--text-muted)" }}>
              {thread.case.client.email}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  const team = thread.case.staffTeam ?? [];

  return (
    <div
      className="border-b px-3 py-2"
      style={{ borderColor: "var(--border-glass)", background: "var(--surface)" }}
    >
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--gold)" }}>
        <Users className="w-3.5 h-3.5" />
        Equipo interno del caso
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {team.length === 0 ? (
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Sin equipo asignado
          </span>
        ) : (
          team.map((member) => (
            <span
              key={member.id}
              className="inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold"
              style={{
                background: member.role === "JEFE_DE_MESA" ? "var(--gold-dim)" : "var(--surface-2)",
                borderColor: member.role === "JEFE_DE_MESA" ? "var(--gold-border)" : "var(--border-glass)",
                color: "var(--text)",
              }}
              title={member.email}
            >
              <span className="truncate">{member.fullName}</span>
              <span className="shrink-0 font-normal" style={{ color: "var(--text-muted)" }}>
                {member.role === "JEFE_DE_MESA" ? "Jefe de mesa" : "Abogado"}
              </span>
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors"
      style={{
        color: active ? "var(--gold)" : "var(--text-muted)",
        borderBottom: active ? "2px solid var(--gold)" : "2px solid transparent",
        background: active ? "var(--surface-2)" : "transparent",
      }}
    >
      {children}
    </button>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center justify-center text-[9px] font-bold leading-none rounded-full min-w-[16px] h-[16px] px-1"
      style={{ background: "#DC2626", color: "#FFFFFF" }}
    >
      {children}
    </span>
  );
}

function InboxList({
  items,
  totalRaw,
  onSelect,
}: {
  items: Summary[];
  totalRaw: number;
  onSelect: (caseId: string, type: "PUBLIC" | "INTERNAL") => void;
}) {
  if (items.length === 0) {
    return (
      <div className="p-6 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
        {totalRaw === 0
          ? "Sin mensajes recientes. Abre 'Casos' para iniciar una conversación."
          : "Sin resultados para ese filtro."}
      </div>
    );
  }
  return (
    <>
      {items.map((m) => (
        <button
          key={`${m.caseId}-${m.type}-${m.createdAt}`}
          type="button"
          onClick={() => onSelect(m.caseId, m.type)}
          className="w-full text-left px-4 py-3 border-b transition-colors hover:bg-[var(--surface-2)]"
          style={{ borderColor: "var(--border-glass)" }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span
                  className="text-[11px] font-bold uppercase tracking-wider truncate"
                  style={{ color: "var(--gold)" }}
                >
                  {m.caseCode}
                </span>
                {m.type === "INTERNAL" ? (
                  <Lock className="w-3 h-3 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
                ) : (
                  <Globe className="w-3 h-3 flex-shrink-0" style={{ color: "var(--green)" }} />
                )}
                {(m.isUnread ?? !m.isMine) && (
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: "#DC2626" }}
                  />
                )}
              </div>
              <div
                className="text-[12px] font-semibold truncate"
                style={{ color: "var(--text)" }}
              >
                {m.clientName}
              </div>
              <div
                className="text-[11px] truncate mt-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                <span className="font-medium">{m.authorName}:</span>{" "}
                {messageNotificationBody(m.body)}
              </div>
            </div>
            <span
              className="text-[10px] font-mono flex-shrink-0"
              style={{ color: "var(--text-muted)" }}
            >
              {new Date(m.createdAt).toLocaleString("es-CL", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </button>
      ))}
    </>
  );
}

function CasesList({
  items,
  totalRaw,
  onSelect,
  refresh,
}: {
  items: CaseEntry[];
  totalRaw: number;
  onSelect: (caseId: string) => void;
  refresh: () => void;
}) {
  if (items.length === 0) {
    return (
      <div className="p-6 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
        {totalRaw === 0 ? (
          <>
            <p>No tienes casos asignados que permitan iniciar conversación.</p>
            <button
              type="button"
              onClick={refresh}
              className="mt-3 px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider"
              style={{
                background: "var(--surface-2)",
                color: "var(--gold)",
                border: "1px solid var(--border-glass)",
              }}
            >
              Recargar
            </button>
          </>
        ) : (
          "Sin resultados para ese filtro."
        )}
      </div>
    );
  }
  return (
    <>
      {items.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.id)}
          className="w-full text-left px-4 py-3 border-b transition-colors hover:bg-[var(--surface-2)]"
          style={{ borderColor: "var(--border-glass)" }}
        >
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span
              className="text-[11px] font-bold uppercase tracking-wider truncate"
              style={{ color: "var(--gold)" }}
            >
              {c.code}
            </span>
            <span
              className="text-[9px] font-mono flex-shrink-0"
              style={{ color: "var(--text-muted)" }}
              title={`${c.commentCount} mensaje(s) en este caso`}
            >
              {c.commentCount} msg
            </span>
          </div>
          <div className="text-[12px] font-semibold truncate" style={{ color: "var(--text)" }}>
            {c.clientName}
          </div>
          <div className="text-[10px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
            {c.categoria ?? "—"} · {c.abogados.map((a) => a.fullName).join(", ") || "Sin abogados"}
          </div>
        </button>
      ))}
    </>
  );
}

function Bubble({
  mine,
  type,
  authorName,
  authorRole,
  createdAt,
  children,
  pending,
  error,
}: {
  mine: boolean;
  type: "INTERNAL" | "PUBLIC";
  authorName: string;
  authorRole?: string;
  createdAt: string;
  children: React.ReactNode;
  pending?: boolean;
  error?: string;
}) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[80%] rounded-lg px-3 py-2 text-[12px]"
        style={{
          background: mine ? "var(--gold-dim)" : "var(--surface-2)",
          border: `1px solid ${
            error
              ? "rgba(239,68,68,0.4)"
              : type === "INTERNAL"
              ? "rgba(120,120,120,0.25)"
              : "rgba(34,197,94,0.3)"
          }`,
          color: "var(--text)",
          opacity: pending ? 0.7 : 1,
        }}
      >
        <div
          className="flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-wider"
          style={{
            color: type === "INTERNAL" ? "var(--text-muted)" : "var(--green)",
          }}
        >
          {type === "INTERNAL" ? (
            <Lock className="w-2.5 h-2.5" />
          ) : (
            <Globe className="w-2.5 h-2.5" />
          )}
          {authorName}
          {authorRole && authorRole !== "CLIENTE" && (
            <span className="opacity-60">({authorRole})</span>
          )}
        </div>
        {children}
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[9px] font-mono" style={{ color: "var(--text-muted)" }}>
            {new Date(createdAt).toLocaleString("es-CL", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {pending && (
            <Loader2 className="w-2.5 h-2.5 animate-spin" style={{ color: "var(--text-muted)" }} />
          )}
          {error && (
            <span className="text-[9px] font-bold" style={{ color: "#DC2626" }}>
              ✗ {error.slice(0, 40)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function TypeToggle({
  label,
  icon,
  active,
  color,
  dim,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  color: string;
  dim: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-1 rounded font-bold uppercase tracking-wider"
      style={{
        background: active ? dim : "transparent",
        color: active ? color : "var(--text-muted)",
        border: "1px solid var(--border-glass)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}
