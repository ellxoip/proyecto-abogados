/**
 * Rate limiter in-memory sliding window por clave.
 *
 * Diseñado para anti-spam de acciones interactivas (comentarios, mensajes).
 * No cubre múltiples instancias del server — para eso necesitarías Redis.
 * En un dev/PoC single-node esto es suficiente.
 *
 * Uso:
 *   const r = checkRateLimit(`comment:${userId}`, { max: 5, windowMs: 10_000 });
 *   if (!r.allowed) return { ok: false, code: "invalid", reason: r.reason };
 */

type Bucket = {
  hits: number[]; // timestamps en ms
};

const buckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; reason: string; retryAfterMs: number };

export function checkRateLimit(
  key: string,
  opts: { max: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - opts.windowMs;
  const bucket = buckets.get(key) ?? { hits: [] };
  // Sliding window: descarta hits viejos.
  bucket.hits = bucket.hits.filter((t) => t > cutoff);
  if (bucket.hits.length >= opts.max) {
    const oldest = bucket.hits[0];
    const retryAfterMs = Math.max(0, oldest + opts.windowMs - now);
    return {
      allowed: false,
      reason: `Demasiados intentos. Reintenta en ${Math.ceil(retryAfterMs / 1000)}s.`,
      retryAfterMs,
    };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { allowed: true, remaining: opts.max - bucket.hits.length };
}

/** Solo expuesta para tests. */
export function _resetRateLimit(key?: string) {
  if (key) buckets.delete(key);
  else buckets.clear();
}
