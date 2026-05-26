"use client";
import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";

interface Cierre {
  id: number; tipo: string; periodo: string; fecha_cierre: string;
  observaciones: string | null; usuario: { nombre: string } | null;
}

export default function CierresPage() {
  const [cierres, setCierres] = useState<Cierre[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ tipo: "MENSUAL", periodo: "", fecha_cierre: new Date().toISOString().slice(0, 10), observaciones: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const r = await fetch("/api/contabilidad/cierres");
    setCierres(await r.json());
  }
  useEffect(() => { fetch("/api/contabilidad/cierres").then(r => r.json()).then(setCierres); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    const r = await fetch("/api/contabilidad/cierres", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (!r.ok) { const d = await r.json(); setError(d.error || "Error"); setSaving(false); return; }
    setSaving(false); setShowForm(false);
    setForm({ tipo: "MENSUAL", periodo: "", fecha_cierre: new Date().toISOString().slice(0, 10), observaciones: "" });
    load();
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Cierres contables</h2>
          <p className="text-sm text-[var(--muted)]">Cierres mensuales y anuales del período</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">Nuevo cierre</button>
      </header>

      {showForm && (
        <form onSubmit={submit} className="card p-5 space-y-4">
          <h3 className="font-semibold">Registrar cierre contable</h3>
          {error && <p className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Tipo *</label>
              <select required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                <option value="MENSUAL">Mensual</option>
                <option value="ANUAL">Anual</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Período *</label>
              <input required placeholder={form.tipo === "MENSUAL" ? "YYYY-MM" : "YYYY"} className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.periodo} onChange={e => setForm(f => ({ ...f, periodo: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Fecha de cierre *</label>
              <input required type="date" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.fecha_cierre} onChange={e => setForm(f => ({ ...f, fecha_cierre: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Observaciones</label>
              <input className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">{saving ? "Cerrando..." : "Registrar cierre"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50">Cancelar</button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Tipo</th>
              <th className="table-cell text-left font-medium">Período</th>
              <th className="table-cell text-left font-medium">Fecha cierre</th>
              <th className="table-cell text-left font-medium">Usuario</th>
              <th className="table-cell text-left font-medium">Observaciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {cierres.map(c => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="table-cell">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${c.tipo === "ANUAL" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>{c.tipo}</span>
                </td>
                <td className="table-cell font-mono font-medium">{c.periodo}</td>
                <td className="table-cell">{formatDate(c.fecha_cierre)}</td>
                <td className="table-cell">{c.usuario?.nombre ?? "—"}</td>
                <td className="table-cell text-[var(--muted)]">{c.observaciones ?? "—"}</td>
              </tr>
            ))}
            {cierres.length === 0 && <tr><td colSpan={5} className="table-cell text-center text-[var(--muted)]">Sin cierres registrados.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
