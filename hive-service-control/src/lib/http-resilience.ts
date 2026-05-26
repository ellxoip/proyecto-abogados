/**
 * Helpers de resiliencia para llamadas HTTP salientes hacia terceros
 * (Meta WhatsApp, Resend, PagaCuotas, etc.).
 *
 * Problema que resuelven:
 *   - Un fetch sin timeout puede colgar 30s+ y bloquear la transacción
 *     que disparó la notificación.
 *   - Sin retry, un 5xx transitorio del proveedor pierde el mensaje.
 *   - Sin circuit breaker, un proveedor caído satura el thread pool con
 *     fetches que esperarán hasta el timeout.
 *
 * Diseño:
 *   - `fetchWithTimeout` envuelve fetch con AbortController. Default 10s.
 *   - `fetchWithRetry` reintenta sólo en errores transitorios (5xx, 408,
 *     429 con Retry-After, errores de red). 4xx no se reintenta.
 *   - Backoff exponencial con jitter para evitar thundering herd.
 *
 * No requiere Redis ni estado externo — apto para serverless.
 */

export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
};

const DEFAULTS = {
  attempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 5_000,
  timeoutMs: 10_000,
} as const;

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export class HttpTimeoutError extends Error {
  constructor(public readonly url: string, public readonly ms: number) {
    super(`HTTP timeout after ${ms}ms: ${url}`);
    this.name = "HttpTimeoutError";
  }
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULTS.timeoutMs,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new HttpTimeoutError(url, timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof HttpTimeoutError) return true;
  if (err instanceof TypeError) return true; // network/DNS
  if (err instanceof Error) {
    const code = (err as { code?: string }).code;
    if (code && /^(ECONN|ETIMEDOUT|EAI_AGAIN|ENETUNREACH)/.test(code)) return true;
  }
  return false;
}

function backoffDelay(attempt: number, opts: Required<RetryOptions>): number {
  const exp = Math.min(opts.baseDelayMs * 2 ** attempt, opts.maxDelayMs);
  const jitter = exp * 0.25 * Math.random();
  return Math.floor(exp + jitter);
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) return Math.max(0, asNumber * 1000);
  const asDate = Date.parse(value);
  if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now());
  return null;
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: RetryOptions = {},
): Promise<Response> {
  const opts: Required<RetryOptions> = {
    attempts: options.attempts ?? DEFAULTS.attempts,
    baseDelayMs: options.baseDelayMs ?? DEFAULTS.baseDelayMs,
    maxDelayMs: options.maxDelayMs ?? DEFAULTS.maxDelayMs,
    timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
  };

  let lastErr: unknown = null;

  for (let attempt = 0; attempt < opts.attempts; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url, init, opts.timeoutMs);

      if (!RETRYABLE_STATUS.has(res.status)) return res;

      const isLast = attempt === opts.attempts - 1;
      if (isLast) return res;

      const retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
      const wait = retryAfterMs ?? backoffDelay(attempt, opts);
      await sleep(wait);
    } catch (err) {
      lastErr = err;
      const isLast = attempt === opts.attempts - 1;
      if (isLast || !isRetryableError(err)) throw err;
      await sleep(backoffDelay(attempt, opts));
    }
  }

  // Unreachable; loop returns or throws.
  throw lastErr ?? new Error("fetchWithRetry: unreachable");
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
