"use client";

import { useState } from "react";
import { Brain } from "lucide-react";
import { useRouter } from "next/navigation";

export function AiAnalyzeButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  async function handleAnalyze() {
    if (!confirm("Esto analizará todos los expedientes activos con IA (puede tomar 1-2 minutos). ¿Continuar?")) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/productividad/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) { setResult(`Error: ${data.error}`); return; }
      const ok = data.results?.filter((r: any) => !r.error).length ?? 0;
      const failed = data.results?.filter((r: any) => r.error).length ?? 0;
      setResult(`✓ ${ok} expedientes analizados${failed > 0 ? ` · ${failed} con error` : ""}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleAnalyze}
        disabled={loading}
        className="flex items-center gap-2 px-5 py-2.5 rounded-md text-[11px] font-bold uppercase tracking-widest text-[var(--text)] transition-colors disabled:opacity-60"
        style={{ background: loading ? "var(--text-muted)" : "var(--bg)" }}
      >
        <Brain className={`w-4 h-4 ${loading ? "animate-pulse" : ""}`} />
        {loading ? "Analizando..." : "Analizar todos con IA"}
      </button>
      {result && (
        <p className="text-[11px] font-medium" style={{ color: result.startsWith("Error") ? "var(--red)" : "#4ADE80" }}>
          {result}
        </p>
      )}
    </div>
  );
}
