/**
 * Cliente sc → hive-financial-control para sincronizar el cambio de
 * contraseña del cliente cuando éste lo dispara desde el portal sc.
 *
 * Endpoint destino: `PATCH /api/integrations/pagacuotas/client-login`
 * Auth: `x-internal-api-key` = `FINANCIAL_INTERNAL_API_KEY` (alias de la
 *       `PAGACUOTAS_INTERNAL_API_KEY` configurada en fc).
 *
 * Falla suave: si fc no responde 2xx, registramos el error y continuamos.
 * La fuente de verdad del hash sigue siendo sc en este punto; un job de
 * reconciliación posterior puede reintentar.
 */

type SyncPayload = {
  rut: string;
  currentPassword: string;
  newPassword: string;
  source?: string;
};

export async function syncClientPasswordToFinancial(payload: SyncPayload): Promise<void> {
  const baseUrl =
    process.env.FINANCIAL_INTERNAL_URL ??
    process.env.HIVE_FINANCIAL_URL ??
    "http://localhost:3000";

  const apiKey =
    process.env.FINANCIAL_INTERNAL_API_KEY ??
    process.env.HIVE_FINANCIAL_INTERNAL_API_KEY ??
    "";

  if (!apiKey) {
    console.warn(
      "[financial-password-sync] FINANCIAL_INTERNAL_API_KEY no seteado; cliente cambió clave en sc pero no se sincronizó a fc.",
      { rut: payload.rut },
    );
    return;
  }

  const url = `${baseUrl.replace(/\/$/, "")}/api/integrations/pagacuotas/client-login`;

  try {
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-internal-api-key": apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        identifier: payload.rut,
        currentPassword: payload.currentPassword,
        newPassword: payload.newPassword,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(
        "[financial-password-sync] fc rechazó la sincronización de contraseña.",
        { rut: payload.rut, status: response.status, body: text.slice(0, 500) },
      );
    }
  } catch (err) {
    console.error(
      "[financial-password-sync] error de red al sincronizar contraseña con fc.",
      { rut: payload.rut, error: err instanceof Error ? err.message : String(err) },
    );
  }
}
