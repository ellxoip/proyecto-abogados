"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Pause, Play, Square, Clock, AlertTriangle, ExternalLink, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { TimerStopDialog } from "./TimerStopDialog";

interface ServerSession {
  id: string;
  status: "ACTIVE" | "PAUSED" | "PENDING_CLOSE" | "COMPLETED" | "FLAGGED" | "DISCARDED";
  caseId: string;
  caseCode: string;
  caseStage: string;
  clientName: string;
  startedAt: string;
  lastResumedAt: string | null;
  accumulatedMs: number;
  currentDurationMs: number;
  warned4h: boolean;
  warned8h: boolean;
  warned10h: boolean;
  autoPausedAt: string | null;
}

function fmt(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ActiveTimerWidget() {
  const { status: authStatus } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<ServerSession | null>(null);
  const [tickMs, setTickMs] = useState(0);
  const [actionPending, setActionPending] = useState<null | "pause" | "resume" | "stop">(null);
  const [collapsed, setCollapsed] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const lastServerSyncRef = useRef<number>(0);

  // Hide on the public pages
  const hidden =
    authStatus !== "authenticated" ||
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/registro");

  // Poll server every 30s and on mount
  useEffect(() => {
    if (hidden) return;
    let mounted = true;

    async function refresh(send: "get" | "heartbeat") {
      try {
        const url = send === "heartbeat" ? "/api/productividad/timer/heartbeat" : "/api/productividad/timer";
        const res = await fetch(url, {
          method: send === "heartbeat" ? "POST" : "GET",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted) return;
        if (data.session) {
          const s: ServerSession = {
            id: data.session.id,
            status: data.session.status,
            caseId: data.session.caseId ?? data.session.case?.id,
            caseCode: data.session.caseCode ?? data.session.case?.code,
            caseStage: data.session.caseStage ?? data.session.case?.stage,
            clientName: data.session.clientName ?? data.session.case?.client?.fullName ?? "",
            startedAt: data.session.startedAt,
            lastResumedAt: data.session.lastResumedAt,
            accumulatedMs: data.session.accumulatedMs,
            currentDurationMs:
              typeof data.currentDurationMs === "number"
                ? data.currentDurationMs
                : data.session.currentDurationMs ?? data.session.accumulatedMs,
            warned4h: data.session.warned4h,
            warned8h: data.session.warned8h,
            warned10h: data.session.warned10h,
            autoPausedAt: data.session.autoPausedAt,
          };
          setSession(s);
          setTickMs(s.currentDurationMs);
          lastServerSyncRef.current = Date.now();
        } else {
          setSession(null);
        }
      } catch {}
    }

    refresh("get");
    const poll = setInterval(() => refresh(session?.status === "ACTIVE" ? "heartbeat" : "get"), 30_000);

    // Local 1s tick (only when ACTIVE) — increments based on time since last server sync
    const tick = setInterval(() => {
      if (!session || session.status !== "ACTIVE") return;
      const drift = Date.now() - lastServerSyncRef.current;
      setTickMs(session.currentDurationMs + drift);
    }, 1000);

    // Heartbeat on tab focus (recover from sleep / window switch)
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh("heartbeat");
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      mounted = false;
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden, session?.status, session?.id]);

  async function callAction(action: "pause" | "resume") {
    setActionPending(action);
    try {
      const res = await fetch(`/api/productividad/timer/${action}`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error ?? "No se pudo completar la acción.");
        return;
      }
      // Refresh state from server
      const refr = await fetch("/api/productividad/timer", { cache: "no-store" });
      const data = await refr.json();
      if (data.session) {
        setSession({
          ...data.session,
          currentDurationMs: data.session.currentDurationMs ?? data.session.accumulatedMs,
        });
        setTickMs(data.session.currentDurationMs ?? data.session.accumulatedMs);
        lastServerSyncRef.current = Date.now();
      }
    } finally {
      setActionPending(null);
    }
  }

  if (hidden || !session) return null;

  const isActive = session.status === "ACTIVE";
  const isPaused = session.status === "PAUSED";
  const isPending = session.status === "PENDING_CLOSE";
  const warningLabel = isPending
    ? "Sesión pasó del tope. Requiere cierre."
    : session.warned10h
    ? "Sesión sobre 10 h continuas."
    : session.warned8h
    ? "Sesión sobre 8 h. Confirma actividad."
    : session.warned4h
    ? "Llevas más de 4 h activo. ¿Sigue en curso?"
    : null;

  const tone = isPending
    ? { bg: "var(--red-dim)", border: "var(--red-border)", color: "var(--red)" }
    : warningLabel
    ? { bg: "var(--amber-dim)", border: "var(--amber-border)", color: "var(--amber)" }
    : isPaused
    ? { bg: "var(--surface-3)", border: "var(--card-border)", color: "var(--text-muted)" }
    : { bg: "var(--green-dim)", border: "var(--green-border)", color: "var(--green)" };

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 w-80 rounded-2xl shadow-[var(--shadow-xl)] overflow-hidden"
        style={{
          background: "var(--surface)",
          border: `1px solid ${tone.border}`,
        }}
      >
        <div
          className="flex items-center justify-between gap-2 px-4 py-2"
          style={{ background: tone.bg, color: tone.color }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] truncate">
              {isPending ? "Cierre pendiente" : isPaused ? "Cronómetro pausado" : "Cronómetro activo"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="rounded p-0.5 hover:bg-[var(--bg-deep)]/10"
            aria-label={collapsed ? "Expandir" : "Colapsar"}
          >
            {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>

        {!collapsed && (
          <div className="p-4 space-y-3">
            <div>
              <p
                className="font-mono text-3xl font-bold text-[var(--text)]"
                style={{ letterSpacing: "-0.02em" }}
              >
                {fmt(tickMs)}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)] truncate">
                <span className="font-mono font-semibold text-[var(--text)]">{session.caseCode}</span>
                {" · "}
                {session.clientName}
              </p>
            </div>

            {warningLabel && (
              <div
                className="flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px] leading-snug"
                style={{ background: tone.bg, borderColor: tone.border, color: tone.color }}
              >
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>{warningLabel}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              {!isPending && (isActive ? (
                <button
                  type="button"
                  onClick={() => callAction("pause")}
                  disabled={actionPending !== null}
                  className="btn-secondary flex-1 text-[11px] py-2"
                  title="Pausar el conteo"
                >
                  {actionPending === "pause" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Pause className="h-3.5 w-3.5" />
                  )}
                  Pausar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => callAction("resume")}
                  disabled={actionPending !== null}
                  className="btn-secondary flex-1 text-[11px] py-2"
                  title="Reanudar el conteo"
                >
                  {actionPending === "resume" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  Reanudar
                </button>
              ))}
              <button
                type="button"
                onClick={() => setStopOpen(true)}
                className="btn-primary flex-1 text-[11px] py-2"
                title="Detener y registrar las horas"
              >
                <Square className="h-3.5 w-3.5" />
                Detener
              </button>
            </div>

            <Link
              href={`/admin/casos/${session.caseId}`}
              className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Abrir expediente
            </Link>
          </div>
        )}
      </div>

      {stopOpen && (
        <TimerStopDialog
          session={session}
          onClose={() => setStopOpen(false)}
          onSuccess={() => {
            setStopOpen(false);
            setSession(null);
            setTickMs(0);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
