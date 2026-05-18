// ── Timer policy · server is the single source of truth ────────────────────
// All thresholds are expressed in milliseconds so we can compare cleanly with
// `Date.now() - lastResumedAt`. The numbers are deliberately conservative —
// they match the spec: "nunca permitir que llegue a sesiones absurdas".

export const TIMER_WARN_4H_MS  =  4 * 60 * 60 * 1000;
export const TIMER_WARN_8H_MS  =  8 * 60 * 60 * 1000;
export const TIMER_WARN_10H_MS = 10 * 60 * 60 * 1000;
export const TIMER_AUTO_CAP_MS = 12 * 60 * 60 * 1000;  // forced pause → PENDING_CLOSE
export const TIMER_HARD_CAP_MS = 16 * 60 * 60 * 1000;  // cannot save a TimeEntry beyond this
export const TIMER_ABANDON_HEARTBEAT_MS = 30 * 60 * 1000; // no heartbeat for 30 min ⇒ abandoned

// Reuse the same long-entry threshold the manual path uses.
export const LONG_ENTRY_MINUTES = 480; // 8h
export const LATE_ENTRY_DAYS = 14;
export const DAILY_CAP_MINUTES = 1440;

export type TimerStatus =
  | "ACTIVE"
  | "PAUSED"
  | "PENDING_CLOSE"
  | "COMPLETED"
  | "FLAGGED"
  | "DISCARDED";

export const ACTIVE_LIKE_STATUSES: TimerStatus[] = ["ACTIVE", "PAUSED", "PENDING_CLOSE"];
