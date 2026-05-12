import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client backed by the service-role key.
 * Bypasses Row Level Security and is the right credential for storage
 * uploads done from server actions / route handlers.
 *
 * NEVER import this from a "use client" file or expose the key in the
 * browser bundle.
 */

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) return null;
  if (url === "https://supabase.co" || !url.includes(".supabase.")) return null;
  if (serviceKey.startsWith("REEMPLAZAR")) return null;

  cached = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

export function isStorageConfigured() {
  return getSupabaseAdmin() !== null;
}
