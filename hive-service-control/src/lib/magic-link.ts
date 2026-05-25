import jwt from "jsonwebtoken";

/**
 * Magic-link tokens para auto-login del cliente desde PagaCuotas tras
 * confirmar el pago. Firma JWT corto (60s por defecto) usando AUTH_SECRET
 * — el mismo secreto NextAuth — para no añadir otro shared key al sistema.
 *
 * Anti-replay: TTL muy corto + claim `purpose: "magic-link"` impide que un
 * token NextAuth normal sea aceptado o viceversa. No persistimos jti
 * porque el window de validez es menor al RTT de un re-uso plausible.
 */

const PURPOSE = "magic-link";
const DEFAULT_TTL_SECONDS = 60;

type MagicPayload = {
  sub: string;
  purpose: typeof PURPOSE;
};

function getSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET/NEXTAUTH_SECRET no definido.");
  return secret;
}

export function signMagicLink(userId: string, ttlSeconds: number = DEFAULT_TTL_SECONDS): string {
  return jwt.sign({ purpose: PURPOSE } satisfies Omit<MagicPayload, "sub">, getSecret(), {
    subject: userId,
    expiresIn: ttlSeconds,
    audience: "hive-service-control",
  });
}

export function verifyMagicLink(token: string): string | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, getSecret(), {
      audience: "hive-service-control",
    }) as MagicPayload;
    if (decoded.purpose !== PURPOSE) return null;
    if (!decoded.sub) return null;
    return decoded.sub;
  } catch {
    return null;
  }
}
