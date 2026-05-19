import { timingSafeEqual } from "node:crypto";

/**
 * Comparación constante en tiempo de dos strings.
 *
 * - Devuelve `false` si las longitudes difieren (sin filtrar el tamaño por
 *   side-channel: `timingSafeEqual` exige buffers del mismo tamaño).
 * - UTF-8 bytes para soportar secretos no-ASCII.
 *
 * Úsalo siempre que compares un valor recibido del request contra un secret
 * en env. Nunca uses `===` para secretos.
 */
export function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
