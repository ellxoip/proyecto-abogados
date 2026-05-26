"use client";
import { useEffect, useState } from "react";

interface CategoriaGasto { id: number; nombre: string; cuenta_contable: string | null; activa: boolean; }

export default function CategoriasGastoPage() {
  const [items, setItems] = useState<CategoriaGasto[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nombre: "", cuenta_contable: "" });
  const [saving, setSaving] = useState(false);

  async function load() { const r = await fetch("/api/configuracion/categorias-gastos"); setItems(await r.json()); }
  useEffect(() => { fetch("/api/configuracion/categorias-gastos").then(r => r.json()).then(setItems); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    await fetch("/api/configuracion/categorias-gastos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false); setShowForm(false); setForm({ nombre: "", cuenta_contable: "" }); load();
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Categorías de gasto</h2>
          <p className="text-sm text-[var(--muted)]">Clasificación de gastos para reportes contables</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">Nueva categoría</button>
      </header>
      {showForm && (
        <form onSubmit={submit} className="card p-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Nombre *</label>
              <input required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Cuenta contable</label>
              <input placeholder="Ej: 5.1.01" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.cuenta_contable} onChange={e => setForm(f => ({ ...f, cuenta_contable: e.target.value }))} />
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
              <th className="table-cell text-left font-medium">Cuenta contable</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {items.map(i => (
              <tr key={i.id} className="hover:bg-slate-50">
                <td className="table-cell font-medium">{i.nombre}</td>
                <td className="table-cell font-mono text-xs">{i.cuenta_contable ?? "—"}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={2} className="table-cell text-center text-[var(--muted)]">Sin categorías.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
