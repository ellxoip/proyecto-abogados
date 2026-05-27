import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const isPlaceholder = !supabaseUrl || supabaseUrl === "https://supabase.co" || !supabaseUrl.includes(".");

export const supabase = createClient(
  isPlaceholder ? "https://placeholder-project.supabase.co" : supabaseUrl,
  supabaseAnonKey ?? "placeholder-anon-key"
);

if (isPlaceholder && typeof window !== "undefined") {
  console.warn("⚠️ [Supabase] Usando URL de marcador de posición. El tiempo real (WebSockets) no funcionará hasta que configures una URL de proyecto válida en el archivo .env");
}

