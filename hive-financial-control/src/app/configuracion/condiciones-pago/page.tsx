"use client";
import { useEffect, useState } from "react";

interface CondicionPago { id: number; nombre: string; dias_plazo: number; descripcion: string | null; activa: boolean; }

export default function CondicionesPagoPage() {
  const [items, setItems] = useState<CondicionPago[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nombre: "", dias_plazo: "30", descripcion: "" });
  const [saving, setSaving] = useState(false);

  async function load() { const r = await fetch("/api/configuracion/condiciones-pago"); setItems(await r.json()); }
  useEffect(() => { fetch("/api/configuracion/condiciones-pago").then(r => r.json()).then(setItems); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    await fetch("/api/configuracion/condiciones-pago", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, dias_plazo: Number(form.dias_plazo) }) });
    setSaving(false); setShowForm(false); setForm({ nombre: "", dias_plazo: "30", descripcion: "" }); load();
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Condiciones de pago</h2>
          <p className="text-sm text-[var(--muted)]">Plazos de pago disponibles para documentos</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">Nueva condición</button>
      </header>
      {showForm && (
        <form onSubmit={submit} className="card p-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Nombre *</label>
              <input required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" placeholder="Ej: 30 días" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Días plazo *</label>
              <input required type="number" min="0" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.dias_plazo} onChange={e => setForm(f => ({ ...f, dias_plazo: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Descripción</label>
              <input className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">{saving ? "..." : "Crear"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50">Cancelar</button>
          </div>
        </form>
      )}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Nombre</th>
              <th className="table-cell text-center font-medium">Días</th>
              <th className="table-cell text-left font-medium">Descripción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {items.map(i => (
              <tr key={i.id} className="hover:bg-slate-50">
                <td className="table-cell font-medium">{i.nombre}</td>
                <td className="table-cell text-center">{i.dias_plazo}</td>
                <td className="table-cell text-[var(--muted)]">{i.descripcion ?? "—"}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={3} className="table-cell text-center text-[var(--muted)]">Sin condiciones.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
