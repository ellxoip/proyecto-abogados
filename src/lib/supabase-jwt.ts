import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";

/**
 * Generates a Supabase-compatible JWT token for Realtime RLS.
 * The payload includes `app.user_id` and `app.user_role` as custom claims
 * so Postgres RLS can read them via `current_setting('app.user_id', true)`.
 */
export function generateSupabaseToken(userId: string, role: Role) {
  const secret = process.env.SUPABASE_SERVICE_KEY;
  if (!secret) {
    console.warn("SUPABASE_SERVICE_KEY is missing. Realtime RLS will fail.");
    return "";
  }

  const payload = {
    sub: userId,
    aud: "authenticated",
    role: "authenticated",
    // Custom claims that Postgres RLS policies expect
    "app.user_id": userId,
    "app.user_role": role,
  };

  // Sign with the service key (or the specific JWT secret if configured differently)
  return jwt.sign(payload, secret, { expiresIn: "4h" });
}
