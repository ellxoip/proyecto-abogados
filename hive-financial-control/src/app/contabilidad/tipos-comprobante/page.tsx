"use client";
import { useEffect, useState } from "react";

interface TipoComprobante {
  id: number; nombre: string; descripcion: string | null;
  prefijo: string | null; siguiente_numero: number; activo: boolean;
  _count: { comprobantes: number };
}

export default function TiposComprobantePage() {
  const [tipos, setTipos] = useState<TipoComprobante[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nombre: "", descripcion: "", prefijo: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await fetch("/api/contabilidad/tipos-comprobante");
    setTipos(await r.json());
  }
  useEffect(() => { fetch("/api/contabilidad/tipos-comprobante").then(r => r.json()).then(setTipos); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/contabilidad/tipos-comprobante", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false); setShowForm(false);
    setForm({ nombre: "", descripcion: "", prefijo: "" });
    load();
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Tipos de comprobante</h2>
          <p className="text-sm text-[var(--muted)]">Configurar tipos de asientos contables</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">Nuevo tipo</button>
      </header>

      {showForm && (
        <form onSubmit={submit} className="card p-5 space-y-4">
          <h3 className="font-semibold">Nuevo tipo de comprobante</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Nombre *</label>
              <input required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" placeholder="Ej: Comprobante de Egreso" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Prefijo</label>
              <input className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" placeholder="Ej: CE" value={form.prefijo} onChange={e => setForm(f => ({ ...f, prefijo: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Descripción</label>
              <input className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">{saving ? "Guardando..." : "Crear tipo"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50">Cancelar</button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Nombre</th>
              <th className="table-cell text-left font-medium">Prefijo</th>
              <th className="table-cell text-left font-medium">Descripción</th>
              <th className="table-cell text-center font-medium">Siguiente N°</th>
              <th className="table-cell text-center font-medium">Comprobantes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {tipos.map(t => (
              <tr key={t.id} className={`hover:bg-slate-50 ${!t.activo ? "opacity-50" : ""}`}>
                <td className="table-cell font-medium">{t.nombre}</td>
                <td className="table-cell font-mono">{t.prefijo ?? "—"}</td>
                <td className="table-cell text-[var(--muted)]">{t.descripcion ?? "—"}</td>
                <td className="table-cell text-center">{t.siguiente_numero}</td>
                <td className="table-cell text-center">{t._count.comprobantes}</td>
              </tr>
            ))}
            {tipos.length === 0 && <tr><td colSpan={5} className="table-cell text-center text-[var(--muted)]">Sin tipos configurados.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
