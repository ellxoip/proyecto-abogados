"use client";
import { useEffect, useState } from "react";

interface ConfigEmpresa {
  razon_social?: string; rut?: string; giro?: string; direccion?: string;
  telefono?: string; email?: string; anio_fiscal?: number;
  dias_gracia_mora?: number; tasa_interes_mora?: number;
}

export default function EmpresaConfigPage() {
  const [form, setForm] = useState<ConfigEmpresa>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { fetch("/api/configuracion/empresa").then(r => r.json()).then(setForm); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/configuracion/empresa", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const f = (field: keyof ConfigEmpresa, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <section className="space-y-6 max-w-2xl">
      <header>
        <h2 className="text-2xl font-semibold">Configuración de empresa</h2>
        <p className="text-sm text-[var(--muted)]">Datos generales y parámetros del sistema</p>
      </header>

      <form onSubmit={submit} className="space-y-6">
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-sm text-[var(--muted)] uppercase tracking-wide">Datos fiscales</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Razón social</label>
              <input className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.razon_social ?? ""} onChange={e => f("razon_social", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">RUT</label>
              <input className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" placeholder="12345678-9" value={form.rut ?? ""} onChange={e => f("rut", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-[var(--muted)] mb-1">Giro</label>
              <input className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.giro ?? ""} onChange={e => f("giro", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-[var(--muted)] mb-1">Dirección</label>
              <input className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.direccion ?? ""} onChange={e => f("direccion", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Teléfono</label>
              <input className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.telefono ?? ""} onChange={e => f("telefono", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Email</label>
              <input type="email" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.email ?? ""} onChange={e => f("email", e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-sm text-[var(--muted)] uppercase tracking-wide">Parámetros de cobranza</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Días de gracia mora</label>
              <input type="number" min="0" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.dias_gracia_mora ?? 0} onChange={e => setForm(p => ({ ...p, dias_gracia_mora: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Tasa interés mora (%)</label>
              <input type="number" min="0" step="0.01" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.tasa_interes_mora ? Number(form.tasa_interes_mora) * 100 : 0} onChange={e => setForm(p => ({ ...p, tasa_interes_mora: Number(e.target.value) / 100 }))} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button type="submit" disabled={saving} className="rounded-md bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {saving ? "Guardando..." : "Guardar configuración"}
          </button>
          {saved && <span className="text-sm text-emerald-600">✓ Guardado correctamente</span>}
        </div>
      </form>
    </section>
  );
}
