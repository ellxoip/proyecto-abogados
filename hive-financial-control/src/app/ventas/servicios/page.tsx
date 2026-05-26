"use client";
import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";

interface Servicio {
  id: number; nombre: string; descripcion: string | null;
  precio_base: string; unidad: string; afecto_iva: boolean; activo: boolean;
}

export default function ServiciosPage() {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Servicio | null>(null);
  const [form, setForm] = useState({ nombre: "", descripcion: "", precio_base: "", unidad: "servicio", afecto_iva: true });
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await fetch("/api/ventas/servicios");
    setServicios(await r.json());
  }
  useEffect(() => { fetch("/api/ventas/servicios").then(r => r.json()).then(setServicios); }, []);

  function startEdit(s: Servicio) {
    setEditing(s);
    setForm({ nombre: s.nombre, descripcion: s.descripcion ?? "", precio_base: s.precio_base, unidad: s.unidad, afecto_iva: s.afecto_iva });
    setShowForm(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form, precio_base: Number(form.precio_base) };
    if (editing) {
      await fetch(`/api/ventas/servicios/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } else {
      await fetch("/api/ventas/servicios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }
    setSaving(false); setShowForm(false); setEditing(null);
    setForm({ nombre: "", descripcion: "", precio_base: "", unidad: "servicio", afecto_iva: true });
    load();
  }

  async function toggle(id: number, activo: boolean) {
    await fetch(`/api/ventas/servicios/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activo: !activo }) });
    load();
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Servicios</h2>
          <p className="text-sm text-[var(--muted)]">Catálogo de servicios facturables</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Nuevo servicio
        </button>
      </header>

      {showForm && (
        <form onSubmit={submit} className="card p-5 space-y-4">
          <h3 className="font-semibold">{editing ? "Editar servicio" : "Nuevo servicio"}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Nombre *</label>
              <input required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Precio base *</label>
              <input required type="number" min="0" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.precio_base} onChange={e => setForm(f => ({ ...f, precio_base: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Unidad</label>
              <select className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.unidad} onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))}>
                <option value="servicio">Servicio</option>
                <option value="hora">Hora</option>
                <option value="mes">Mes</option>
                <option value="causa">Causa</option>
                <option value="unidad">Unidad</option>
              </select>
            </div>
            <div className="flex items-center gap-3 pt-5">
              <input type="checkbox" id="afecto_iva" checked={form.afecto_iva} onChange={e => setForm(f => ({ ...f, afecto_iva: e.target.checked }))} />
              <label htmlFor="afecto_iva" className="text-sm">Afecto a IVA (19%)</label>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-[var(--muted)] mb-1">Descripción</label>
              <textarea className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" rows={2} value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {saving ? "Guardando..." : editing ? "Guardar cambios" : "Crear servicio"}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50">
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Nombre</th>
              <th className="table-cell text-left font-medium">Descripción</th>
              <th className="table-cell text-left font-medium">Unidad</th>
              <th className="table-cell text-center font-medium">IVA</th>
              <th className="table-cell text-right font-medium">Precio base</th>
              <th className="table-cell text-center font-medium">Estado</th>
              <th className="table-cell text-center font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {servicios.map(s => (
              <tr key={s.id} className={`hover:bg-slate-50 ${!s.activo ? "opacity-50" : ""}`}>
                <td className="table-cell font-medium">{s.nombre}</td>
                <td className="table-cell text-[var(--muted)]">{s.descripcion ?? "—"}</td>
                <td className="table-cell">{s.unidad}</td>
                <td className="table-cell text-center">{s.afecto_iva ? "Sí" : "No"}</td>
                <td className="table-cell text-right font-medium">{formatCurrency(Number(s.precio_base))}</td>
                <td className="table-cell text-center">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${s.activo ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {s.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="table-cell text-center">
                  <div className="flex gap-2 justify-center">
                    <button onClick={() => startEdit(s)} className="text-xs text-[var(--accent)] hover:underline">Editar</button>
                    <button onClick={() => toggle(s.id, s.activo)} className="text-xs text-[var(--muted)] hover:text-slate-700">
                      {s.activo ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {servicios.length === 0 && (
              <tr><td colSpan={7} className="table-cell text-center text-[var(--muted)]">Sin servicios.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
