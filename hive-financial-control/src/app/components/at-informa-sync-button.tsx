"use client";

import { useState } from "react";

type SyncResult = {
  success: boolean;
  planesProcesados: number;
  clientesUpserted: number;
  contratosUpserted: number;
  cuotasUpserted: number;
};

export function AtInformaSyncButton({
  lastSyncAt,
}: {
  lastSyncAt: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [lastRun, setLastRun] = useState(lastSyncAt);

  async function runSync() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/internal/sync/at-informa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ solo_pendientes: true }),
      });

      const json = (await response.json()) as SyncResult | { error: string };
      if (!response.ok || "error" in json) {
        throw new Error("error" in json ? json.error : "No se pudo sincronizar");
      }

      setResult(json);
      setLastRun(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--muted)]">Integración AT-INFORMA</p>
          <p className="text-xs text-[var(--muted)]">Última sincronización: {new Date(lastRun).toLocaleString("es-CL")}</p>
        </div>
        <button
          type="button"
          className="rounded-md bg-[#12212f] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          onClick={runSync}
          disabled={loading}
        >
          {loading ? "Sincronizando..." : "Sincronizar AT-INFORMA"}
        </button>
      </div>

      {result && (
        <p className="text-sm text-green-700">
          {`Planes: ${result.planesProcesados} · Clientes: ${result.clientesUpserted} · Contratos: ${result.contratosUpserted} · Cuotas: ${result.cuotasUpserted}`}
        </p>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
