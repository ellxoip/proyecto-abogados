"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Config = {
  id?: number;
  dias_gracia_mora: number;
  tasa_interes_mora: number;
  moneda_base: string;
  zona_horaria: string;
  formato_fecha: string;
  anio_fiscal: number | null;
};

export default function ParametrosPage() {
  const [config, setConfig] = useState<Config>({
    dias_gracia_mora: 0,
    tasa_interes_mora: 0,
    moneda_base: "CLP",
    zona_horaria: "America/Santiago",
    formato_fecha: "dd/MM/yyyy",
    anio_fiscal: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/configuracion/empresa").then(r => r.json()).then(data => {
      if (data) setConfig(data);
      setLoading(false);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/configuracion/empresa", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (loading) return <div className="text-sm text-[var(--muted)]">Cargando...</div>;

  return (
    <section className="space-y-6">
      <header>
        <Link href="/configuracion" className="text-xs text-[var(--muted)] hover:underline">← Configuración</Link>
        <h2 className="mt-1 text-2xl font-semibold">Parámetros del sistema</h2>
        <p className="text-sm text-[var(--muted)]">Comportamiento general del sistema</p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold">Cobranza</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Días de gracia para mora</label>
              <input type="number" min="0" value={config.dias_gracia_mora}
                onChange={e => setConfig({ ...config, dias_gracia_mora: Number(e.target.value) })}
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
              <p className="text-xs text-[var(--muted)] mt-1">Días después del vencimiento antes de marcar como vencida</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Tasa de interés por mora (%)</label>
              <input type="number" step="0.01" min="0" max="100"
                value={(config.tasa_interes_mora * 100).toFixed(2)}
                onChange={e => setConfig({ ...config, tasa_interes_mora: Number(e.target.value) / 100 })}
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
              <p className="text-xs text-[var(--muted)] mt-1">Porcentaje mensual de interés aplicado a cuotas vencidas</p>
            </div>
          </div>
        </div>

        <div className="card p-5 space-y-4">
          <h3 className="font-semibold">Sistema</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Moneda base</label>
              <select value={config.moneda_base} onChange={e => setConfig({ ...config, moneda_base: e.target.value })}
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm">
                <option value="CLP">CLP — Peso chileno</option>
                <option value="USD">USD — Dólar</option>
                <option value="EUR">EUR — Euro</option>
                <option value="UF">UF — Unidad de Fomento</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Zona horaria</label>
              <select value={config.zona_horaria} onChange={e => setConfig({ ...config, zona_horaria: e.target.value })}
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm">
                <option value="America/Santiago">America/Santiago (Chile)</option>
                <option value="America/Bogota">America/Bogota</option>
                <option value="America/Lima">America/Lima</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Formato de fecha</label>
              <select value={config.formato_fecha} onChange={e => setConfig({ ...config, formato_fecha: e.target.value })}
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm">
                <option value="dd/MM/yyyy">dd/MM/yyyy (25/12/2024)</option>
                <option value="MM/dd/yyyy">MM/dd/yyyy (12/25/2024)</option>
                <option value="yyyy-MM-dd">yyyy-MM-dd (2024-12-25)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Año fiscal</label>
              <input type="number" value={config.anio_fiscal ?? new Date().getFullYear()}
                onChange={e => setConfig({ ...config, anio_fiscal: Number(e.target.value) })}
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving}
            className="rounded-md bg-[var(--accent)] px-6 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? "Guardando..." : "Guardar parámetros"}
          </button>
          {saved && <span className="text-sm text-emerald-600">✓ Guardado</span>}
        </div>
      </form>
    </section>
  );
}
