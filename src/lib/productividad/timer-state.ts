// ── Pure helpers for TimerSession state machine ─────────────────────────────
// These functions never touch the database directly; they compute the next
// state from a (loaded session, "now") tuple. Each route uses them inside the
// transaction that persists the change, so we keep the math testable and the
// I/O obviously bounded.
import {
  TIMER_AUTO_CAP_MS,
  TIMER_WARN_4H_MS,
  TIMER_WARN_8H_MS,
  TIMER_WARN_10H_MS,
  TIMER_ABANDON_HEARTBEAT_MS,
} from "./timer-policy";

export type StoredTimerEvent = {
  kind:
    | "started"
    | "paused"
    | "resumed"
    | "warning_4h"
    | "warning_8h"
    | "warning_10h"
    | "auto_paused"
    | "heartbeat_recovered"
    | "abandoned"
    | "stopped"
    | "completed"
    | "discarded";
  at: string;
  /** Free-form details captured at the moment of the event. */
  detail?: Record<string, unknown>;
};

export function readEvents(eventsJson: string | null | undefined): StoredTimerEvent[] {
  if (!eventsJson) return [];
  try {
    const parsed = JSON.parse(eventsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendEvent(
  eventsJson: string | null | undefined,
  event: StoredTimerEvent,
): string {
  const events = readEvents(eventsJson);
  events.push(event);
  // Soft cap to keep the JSON blob bounded — the older events are kept as
  //-the- evidence (we never drop), only trimmed to head + tail if absurdly long.
  if (events.length > 500) {
    return JSON.stringify([...events.slice(0, 50), ...events.slice(events.length - 400)]);
  }
  return JSON.stringify(events);
}

/**
 * Computes the *current* accumulated duration in milliseconds, taking into
 * account a session that may still be ACTIVE. For a paused / pending / closed
 * session we just trust the stored `accumulatedMs`.
 */
export function computeCurrentDurationMs(session: {
  status: string;
  accumulatedMs: number;
  lastResumedAt: Date | null;
}, now: Date): number {
  if (session.status !== "ACTIVE" || !session.lastResumedAt) {
    return session.accumulatedMs;
  }
  const runningMs = Math.max(0, now.getTime() - session.lastResumedAt.getTime());
  return session.accumulatedMs + runningMs;
}

/**
 * Pure helper to decide whether the timer should be auto-paused. We pause the
 * timer when the *active* span (from the last resume) hits the 12 h cap.
 */
export function shouldAutoCap(session: {
  status: string;
  lastResumedAt: Date | null;
}, now: Date): boolean {
  if (session.status !== "ACTIVE" || !session.lastResumedAt) return false;
  return now.getTime() - session.lastResumedAt.getTime() >= TIMER_AUTO_CAP_MS;
}

/**
 * Decide if the session has been abandoned (no heartbeat for > 30 min while
 * ACTIVE). Pausa el conteo y deja la sesión PENDING_CLOSE para revisión.
 */
export function shouldMarkAbandoned(session: {
  status: string;
  lastHeartbeatAt: Date | null;
  lastResumedAt: Date | null;
}, now: Date): boolean {
  if (session.status !== "ACTIVE") return false;
  const reference = session.lastHeartbeatAt ?? session.lastResumedAt;
  if (!reference) return false;
  return now.getTime() - reference.getTime() >= TIMER_ABANDON_HEARTBEAT_MS;
}

export function abandonmentCutoffAt(session: {
  status: string;
  lastHeartbeatAt: Date | null;
  lastResumedAt: Date | null;
}, now: Date): Date | null {
  if (!shouldMarkAbandoned(session, now)) return null;
  const reference = session.lastHeartbeatAt ?? session.lastResumedAt;
  if (!reference) return null;
  return new Date(Math.min(now.getTime(), reference.getTime() + TIMER_ABANDON_HEARTBEAT_MS));
}

/**
 * Returns the warning thresholds the session has just crossed in the current
 * active span, so the caller can mark them as fired (warned4h/warned8h/...)
 * and append the corresponding event.
 */
export function pendingWarnings(session: {
  status: string;
  lastResumedAt: Date | null;
  accumulatedMs: number;
  warned4h: boolean;
  warned8h: boolean;
  warned10h: boolean;
}, now: Date): Array<"4h" | "8h" | "10h"> {
  if (session.status !== "ACTIVE" || !session.lastResumedAt) return [];
  const currentMs = computeCurrentDurationMs(session, now);
  const out: Array<"4h" | "8h" | "10h"> = [];
  if (!session.warned4h && currentMs >= TIMER_WARN_4H_MS) out.push("4h");
  if (!session.warned8h && currentMs >= TIMER_WARN_8H_MS) out.push("8h");
  if (!session.warned10h && currentMs >= TIMER_WARN_10H_MS) out.push("10h");
  return out;
}
