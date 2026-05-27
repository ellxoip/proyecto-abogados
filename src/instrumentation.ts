/**
 * Boot hook de Next (habilitado por experimental.instrumentationHook).
 *
 * Valida la presencia de variables de entorno al arrancar el server, para
 * convertir los fallos silenciosos de config (como el drift de NEXTAUTH_URL /
 * INGEST secret que rompía integraciones en prod) en errores ruidosos:
 *
 *   - CRITICAL faltante  → throw (fail-fast): el server no arranca, el deploy
 *     falla visiblemente en vez de servir 500s.
 *   - INTEGRATION faltante → warning ruidoso: la feature queda degradada pero
 *     el server arranca (no toda integración aplica a todo deploy).
 *
 * Solo corre en runtime nodejs (no edge) y se omite en la fase de build.
 */

// Sin estos, la app no puede funcionar de ninguna forma.
const CRITICAL = ["DATABASE_URL", "AUTH_SECRET"] as const;

// Su ausencia apaga/degrada una integración concreta; se avisa, no se aborta.
const INTEGRATION = [
  "DIRECT_URL",
  "NEXTAUTH_URL",
  "INTEGRATION_INTERNAL_API_KEY",
  "CRM_INGEST_SECRET",
  "CRON_SECRET",
  "FINANCIAL_INTERNAL_URL",
  "FINANCIAL_INTERNAL_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_KEY",
  "OPENAI_API_KEY",
  "RESEND_API_KEY",
  "META_WHATSAPP_TOKEN",
] as const;

function missing(keys: readonly string[]): string[] {
  return keys.filter((k) => {
    const v = process.env[k];
    return typeof v !== "string" || v.trim().length === 0;
  });
}

export function register(): void {
  // No correr en el runtime edge ni durante `next build`.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const missingCritical = missing(CRITICAL);
  const missingIntegration = missing(INTEGRATION);

  if (missingIntegration.length > 0) {
    console.warn(
      `[env] integraciones degradadas, faltan vars: ${missingIntegration.join(", ")}`,
    );
  }

  if (missingCritical.length > 0) {
    // Fail-fast: aborta el arranque con un mensaje claro.
    throw new Error(
      `[env] FALTAN variables críticas para arrancar: ${missingCritical.join(", ")}. ` +
        `Configúralas en el entorno del host antes de deployar.`,
    );
  }

  console.info("[env] validación OK — variables críticas presentes.");
}
