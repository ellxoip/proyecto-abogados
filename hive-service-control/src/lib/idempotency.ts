/**
 * Idempotencia ligera para integraciones inbound.
 *
 * Problema:
 *   Un partner puede reintentar el mismo POST (timeout cliente, retry de
 *   queue). Sin idempotencia, cada retry genera audit rows duplicados,
 *   notificaciones repetidas o, peor, dobles inserts.
 *
 *   La idempotencia "por dominio" ya existe en algunos endpoints (case_code
 *   único, RUT único). Pero hay endpoints donde no aplica: financial-warning
 *   crea audits cada vez aunque sea el mismo `warning_id`, payment-needed
 *   notifica admins en cada llamada.
 *
 * Diseño:
 *   - El cliente envía `Idempotency-Key` header (UUID o secuencia interna).
 *     Sin header, el endpoint funciona como antes (no rompemos contratos).
 *   - Cache LRU en memoria con TTL (default 1h). Devuelve la respuesta
 *     cacheada para keys vistas.
 *   - Por instancia (no replicado). Apto para single-region o detrás de un
 *     sticky load balancer. Para multi-region usar tabla DB.
 *
 * Garantía:
 *   "exactly-once" best-effort en una ventana TTL. Si la primera ejecución
 *   está en vuelo y llega un retry, se devuelve la cached response del
 *   request previo (esto evita la doble escritura aunque cueste linealidad).
 */

type CacheEntry = {
  status: number;
  body: unknown;
  storedAt: number;
};

type InFlightEntry = {
  promise: Promise<CacheEntry>;
};

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1h
const DEFAULT_MAX_KEYS = 5_000;

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, InFlightEntry>();

function evictExpired(now: number, ttlMs: number) {
  for (const [key, entry] of cache) {
    if (now - entry.storedAt > ttlMs) cache.delete(key);
  }
}

function evictIfOverCapacity(maxKeys: number) {
  if (cache.size <= maxKeys) return;
  // Map iteration order = insertion order = oldest first.
  const toRemove = cache.size - maxKeys;
  let removed = 0;
  for (const key of cache.keys()) {
    cache.delete(key);
    removed += 1;
    if (removed >= toRemove) break;
  }
}

export type IdempotencyOptions = {
  ttlMs?: number;
  maxKeys?: number;
};

/**
 * Ejecuta `handler` una sola vez por `key` dentro de la ventana TTL.
 * Retornos siguientes con la misma key sirven la respuesta cacheada.
 *
 * Si `key` es null/undefined, no aplica idempotencia: corre el handler
 * directo sin cache.
 */
export async function withIdempotency<T extends { status: number; body: unknown }>(
  key: string | null | undefined,
  handler: () => Promise<T>,
  opts: IdempotencyOptions = {},
): Promise<T> {
  if (!key || key.length === 0 || key.length > 256) {
    const res = await handler();
    return res;
  }

  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const maxKeys = opts.maxKeys ?? DEFAULT_MAX_KEYS;
  const now = Date.now();

  evictExpired(now, ttlMs);

  const cached = cache.get(key);
  if (cached) return { status: cached.status, body: cached.body } as T;

  const pending = inflight.get(key);
  if (pending) {
    const entry = await pending.promise;
    return { status: entry.status, body: entry.body } as T;
  }

  const run = (async () => {
    try {
      const result = await handler();
      const entry: CacheEntry = {
        status: result.status,
        body: result.body,
        storedAt: Date.now(),
      };
      cache.set(key, entry);
      evictIfOverCapacity(maxKeys);
      return entry;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, { promise: run });
  const entry = await run;
  return { status: entry.status, body: entry.body } as T;
}

/**
 * Lee el header `Idempotency-Key` del request (case-insensitive).
 * Devuelve null si no viene o es inválido.
 */
export function getIdempotencyKey(req: Request): string | null {
  const value = req.headers.get("idempotency-key");
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 256) return null;
  return trimmed;
}

/**
 * Helper para tests: limpia el cache. NO usar en producción.
 */
export function _resetIdempotencyCacheForTests() {
  cache.clear();
  inflight.clear();
}
