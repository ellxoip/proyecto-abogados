/**
 * Cliente HTTP que consulta el reporte de warnings de morosidad en
 * hive-financial-control para reflejarlo fielmente en el dashboard de mora.
 *
 * Es la única vía permitida para conocer el estado real de avisos enviados:
 * la lógica del cron vive en financial y aquí sólo leemos.
 */

export type WarningLevel = "WARNING_10" | "WARNING_20" | "WARNING_30";

export type WarningSummary = {
  rut: string;
  cliente_id: number;
  cliente_nombre: string;
  max_level: WarningLevel | null;
  counts: Record<WarningLevel, number>;
  last_warning_at: string | null;
  cuotas_vencidas: number;
  saldo_vencido: number;
};

function normalizeRut(rut: string | null | undefined): string {
  return (rut ?? "").replace(/\./g, "").toLowerCase().trim();
}

/**
 * Devuelve un mapa rut → resumen de warnings. RUTs sin match retornan undefined.
 * Si financial está caído o falla auth, devuelve un Map vacío y loguea — el
 * dashboard sigue funcionando con la info local que ya tenía.
 */
export async function fetchWarningSummariesByRut(
  ruts: Array<string | null | undefined>,
): Promise<Map<string, WarningSummary>> {
  const url = (process.env.FINANCIAL_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const key = process.env.HIVE_FINANCIAL_INTEGRATION_API_KEY
    ?? process.env.INTEGRATION_INTERNAL_API_KEY
    ?? "";

  const cleaned = Array.from(
    new Set(
      ruts
        .map(normalizeRut)
        .filter((r) => r.length > 0),
    ),
  );

  const map = new Map<string, WarningSummary>();
  if (cleaned.length === 0 || !key) return map;

  // Pagina por seguridad: el endpoint acepta hasta 200, usamos 100.
  const chunks: string[][] = [];
  for (let i = 0; i < cleaned.length; i += 100) chunks.push(cleaned.slice(i, i + 100));

  for (const chunk of chunks) {
    try {
      const res = await fetch(
        `${url}/api/internal/integration/warnings-by-rut?ruts=${encodeURIComponent(chunk.join(","))}`,
        {
          headers: { Authorization: `Bearer ${key}` },
          cache: "no-store",
        },
      );
      if (!res.ok) {
        console.warn("[financial-warnings] HTTP", res.status, await res.text());
        continue;
      }
      const json: { ok: boolean; summaries?: WarningSummary[] } = await res.json();
      if (!json.ok || !json.summaries) continue;
      for (const s of json.summaries) {
        map.set(normalizeRut(s.rut), s);
      }
    } catch (err) {
      console.warn("[financial-warnings] fetch failed:", err);
    }
  }

  return map;
}
