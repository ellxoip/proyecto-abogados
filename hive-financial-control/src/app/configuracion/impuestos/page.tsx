"use client";
import { useEffect, useState } from "react";

interface Impuesto { id: number; nombre: string; tasa: string; tipo: string; activo: boolean; }

export default function ImpuestosPage() {
  const [impuestos, setImpuestos] = useState<Impuesto[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nombre: "", tasa: "", tipo: "IVA" });
  const [saving, setSaving] = useState(false);

  async function load() { const r = await fetch("/api/configuracion/impuestos"); setImpuestos(await r.json()); }
  useEffect(() => { fetch("/api/configuracion/impuestos").then(r => r.json()).then(setImpuestos); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    await fetch("/api/configuracion/impuestos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, tasa: Number(form.tasa) / 100 }) });
    setSaving(false); setShowForm(false); setForm({ nombre: "", tasa: "", tipo: "IVA" }); load();
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Impuestos</h2>
          <p className="text-sm text-[var(--muted)]">Tasas de impuestos aplicables</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">Nuevo impuesto</button>
      </header>
      {showForm && (
        <form onSubmit={submit} className="card p-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Nombre *</label>
              <input required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Tasa % *</label>
              <input required type="number" min="0" max="100" step="0.01" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.tasa} onChange={e => setForm(f => ({ ...f, tasa: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Tipo *</label>
              <select required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                <option>IVA</option><option>RETENCION</option><option>TIMBRES</option><option>OTRO</option>
              </select>
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
              <th className="table-cell text-left font-medium">Tipo</th>
              <th className="table-cell text-right font-medium">Tasa</th>
              <th className="table-cell text-center font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {impuestos.map(i => (
              <tr key={i.id} className="hover:bg-slate-50">
                <td className="table-cell font-medium">{i.nombre}</td>
                <td className="table-cell">{i.tipo}</td>
                <td className="table-cell text-right">{(Number(i.tasa) * 100).toFixed(2)}%</td>
                <td className="table-cell text-center">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${i.activo ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{i.activo ? "Activo" : "Inactivo"}</span>
                </td>
              </tr>
            ))}
            {impuestos.length === 0 && <tr><td colSpan={4} className="table-cell text-center text-[var(--muted)]">Sin impuestos.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
