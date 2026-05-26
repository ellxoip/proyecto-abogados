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

const IDLE_AUTO_PAUSE_MS = 30 * 60 * 1000;

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
  const lastActivityRef = useRef<number>(Date.now());
  const idlePauseTriggeredRef = useRef(false);

  // Hide on the public pages
  const hidden =
    authStatus !== "authenticated" ||
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/registro");

  // Refs para evitar closures stale entre el tick local (1s) y los
  // refresh del server (30s). El bug previo era: el tick capturaba
  // `session.currentDurationMs` del primer render (=0) y al hacer
  // `lastServerSyncRef = now` en cada heartbeat, el `drift` se reseteaba
  // a 0 → el cronómetro volvía visualmente a 00:00:00 cada 30s.
  const baseMsRef = useRef<number>(0);
  const isActiveRef = useRef<boolean>(false);

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
          // Re-sincronizar reloj local al valor autoritativo del server.
          baseMsRef.current = s.currentDurationMs;
          isActiveRef.current = s.status === "ACTIVE";
          setTickMs(s.currentDurationMs);
          lastServerSyncRef.current = Date.now();
        } else {
          setSession(null);
          baseMsRef.current = 0;
          isActiveRef.current = false;
          setTickMs(0);
        }
      } catch {}
    }

    refresh("get");
    const poll = setInterval(() => refresh(isActiveRef.current ? "heartbeat" : "get"), 30_000);

    // Local 1s tick (only when ACTIVE) — increments based on time since
    // last server sync. Usa refs para no capturar valores stale del
    // primer render.
    const tick = setInterval(() => {
      if (!isActiveRef.current) return;
      const drift = Date.now() - lastServerSyncRef.current;
      setTickMs(baseMsRef.current + drift);
    }, 1000);

    // Heartbeat on tab focus (recover from sleep / window switch)
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh("heartbeat");
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Listener: cuando TimerLauncher/TimerOnboardingPrompt arrancan una
    // sesión, refresh inmediato para que el widget aparezca sin lag.
    const onTimerStarted = () => refresh("get");
    window.addEventListener("timer:started", onTimerStarted);

    return () => {
      mounted = false;
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("timer:started", onTimerStarted);
    };
    // Sólo hidden importa para tear-down/setup del effect. session.status
    // se lee via isActiveRef para evitar re-creación del interval cada
    // pause/resume (que reiniciaba el tick).
  }, [hidden]);

  useEffect(() => {
    if (hidden) return;

    lastActivityRef.current = Date.now();
    idlePauseTriggeredRef.current = false;

    const markActivity = () => {
      lastActivityRef.current = Date.now();
      if (!isActiveRef.current) idlePauseTriggeredRef.current = false;
    };

    const activityEvents = ["keydown", "mousedown", "mousemove", "scroll", "touchstart", "click"];
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, markActivity, { passive: true });
    });

    const idleCheck = setInterval(async () => {
      if (!isActiveRef.current || idlePauseTriggeredRef.current) return;
      if (Date.now() - lastActivityRef.current < IDLE_AUTO_PAUSE_MS) return;

      idlePauseTriggeredRef.current = true;
      try {
        const res = await fetch("/api/productividad/timer/pause", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "idle_timeout" }),
        });
        if (!res.ok) return;

        const refr = await fetch("/api/productividad/timer", { cache: "no-store" });
        const data = await refr.json();
        if (data.session) {
          const current = data.currentDurationMs ?? data.session.currentDurationMs ?? data.session.accumulatedMs;
          setSession({
            ...data.session,
            currentDurationMs: current,
          });
          baseMsRef.current = current;
          isActiveRef.current = data.session.status === "ACTIVE";
          setTickMs(current);
          lastServerSyncRef.current = Date.now();
        }
      } catch {}
    }, 60_000);

    return () => {
      clearInterval(idleCheck);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, markActivity);
      });
    };
  }, [hidden]);

  async function callAction(action: "pause" | "resume") {
    setActionPending(action);
    try {
      const res = await fetch(`/api/productividad/timer/${action}`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error ?? "No se pudo completar la acción.");
        // Aunque el server haya respondido error, el estado pudo cambiar
        // (ej. HARD_CAP_REACHED escala la sesión a PENDING_CLOSE). Por eso
        // refrescamos siempre — sin esto, el widget mostraba PAUSED
        // mientras el backend ya marcaba PENDING_CLOSE.
      }
      const refr = await fetch("/api/productividad/timer", { cache: "no-store" });
      const data = await refr.json();
      if (data.session) {
        const current = data.currentDurationMs ?? data.session.currentDurationMs ?? data.session.accumulatedMs;
        setSession({
          ...data.session,
          currentDurationMs: current,
        });
        // Sincronizar refs para que el tick local arranque del valor real.
        baseMsRef.current = current;
        isActiveRef.current = data.session.status === "ACTIVE";
        if (data.session.status === "ACTIVE") {
          lastActivityRef.current = Date.now();
          idlePauseTriggeredRef.current = false;
        }
        setTickMs(current);
        lastServerSyncRef.current = Date.now();
      } else {
        setSession(null);
        baseMsRef.current = 0;
        isActiveRef.current = false;
        setTickMs(0);
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
    ? "Conteo detenido por control interno. Requiere cierre o descarte."
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
