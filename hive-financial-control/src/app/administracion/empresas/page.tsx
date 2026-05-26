"use client";
import { useEffect, useState } from "react";

interface Empresa { id: number; nombre: string; rut: string; razon_social: string; giro: string | null; activa: boolean; }

export default function EmpresasAdminPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nombre: "", rut: "", razon_social: "", giro: "", email: "", telefono: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() { const r = await fetch("/api/administracion/empresas"); setEmpresas(await r.json()); }
  useEffect(() => { fetch("/api/administracion/empresas").then(r => r.json()).then(setEmpresas); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    const r = await fetch("/api/administracion/empresas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (!r.ok) { const d = await r.json(); setError(d.error || "Error"); setSaving(false); return; }
    setSaving(false); setShowForm(false); setForm({ nombre: "", rut: "", razon_social: "", giro: "", email: "", telefono: "" }); load();
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Empresas</h2>
          <p className="text-sm text-[var(--muted)]">Administración de empresas del sistema multi-tenant</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">Nueva empresa</button>
      </header>
      {showForm && (
        <form onSubmit={submit} className="card p-5 space-y-4">
          {error && <p className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Nombre *</label>
              <input required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">RUT *</label>
              <input required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.rut} onChange={e => setForm(f => ({ ...f, rut: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-[var(--muted)] mb-1">Razón social *</label>
              <input required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.razon_social} onChange={e => setForm(f => ({ ...f, razon_social: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Giro</label>
              <input className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.giro} onChange={e => setForm(f => ({ ...f, giro: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Email</label>
              <input type="email" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
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
              <th className="table-cell text-left font-medium">RUT</th>
              <th className="table-cell text-left font-medium">Giro</th>
              <th className="table-cell text-center font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {empresas.map(e => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="table-cell font-medium">{e.nombre}</td>
                <td className="table-cell font-mono">{e.rut}</td>
                <td className="table-cell text-[var(--muted)]">{e.giro ?? "—"}</td>
                <td className="table-cell text-center">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${e.activa ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{e.activa ? "Activa" : "Inactiva"}</span>
                </td>
              </tr>
            ))}
            {empresas.length === 0 && <tr><td colSpan={4} className="table-cell text-center text-[var(--muted)]">Sin empresas.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
