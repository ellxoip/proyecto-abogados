"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

type Periodo = "hoy" | "semana" | "mes" | "mes_anterior";

const PRESETS: { value: Periodo; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "semana", label: "Esta semana" },
  { value: "mes", label: "Este mes" },
  { value: "mes_anterior", label: "Mes anterior" },
];

type Props = {
  periodo: string;
  desde: string;
  hasta: string;
  isCustom: boolean;
  label: string;
};

export function DashboardFilters({ periodo, desde, hasta, isCustom, label }: Props) {
  const router = useRouter();
  const [showCustom, setShowCustom] = useState(isCustom);
  const [desdeVal, setDesdeVal] = useState(desde);
  const [hastaVal, setHastaVal] = useState(hasta);

  const applyPreset = useCallback(
    (value: Periodo) => {
      setShowCustom(false);
      router.push(`/dashboard?periodo=${value}`);
    },
    [router],
  );

  const applyCustom = useCallback(() => {
    if (desdeVal && hastaVal && desdeVal <= hastaVal) {
      router.push(`/dashboard?desde=${desdeVal}&hasta=${hastaVal}`);
    }
  }, [router, desdeVal, hastaVal]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mr-1">
          Período
        </span>

        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => applyPreset(p.value)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              !isCustom && periodo === p.value
                ? "border-slate-800 bg-slate-800 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50"
            }`}
          >
            {p.label}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setShowCustom((v) => !v)}
          className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
            isCustom || showCustom
              ? "border-[#0a7ea4] bg-[#0a7ea4] text-white"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50"
          }`}
        >
          Personalizado
        </button>

        {!showCustom && (
          <span className="ml-1 text-sm text-slate-400">{label}</span>
        )}
      </div>

      {showCustom && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Desde</span>
            <input
              type="date"
              value={desdeVal}
              onChange={(e) => setDesdeVal(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:border-[#0a7ea4] focus:outline-none focus:ring-1 focus:ring-[#0a7ea4]"
            />
          </div>
          <span className="text-slate-300">—</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Hasta</span>
            <input
              type="date"
              value={hastaVal}
              onChange={(e) => setHastaVal(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:border-[#0a7ea4] focus:outline-none focus:ring-1 focus:ring-[#0a7ea4]"
            />
          </div>
          <button
            type="button"
            onClick={applyCustom}
            disabled={!desdeVal || !hastaVal || desdeVal > hastaVal}
            className="rounded-full border border-[#0a7ea4] bg-[#0a7ea4] px-4 py-1.5 text-sm font-medium text-white transition-opacity disabled:opacity-40"
          >
            Aplicar rango
          </button>
          {isCustom && (
            <span className="text-sm text-slate-400">{label}</span>
          )}
        </div>
      )}
    </div>
  );
}
