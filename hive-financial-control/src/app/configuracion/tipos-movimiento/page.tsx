"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type TipoMov = {
  id: number;
  nombre: string;
  naturaleza: string;
  cuenta_contable: string | null;
  recurrente: boolean;
  activo: boolean;
};

export default function TiposMovimientoPage() {
  const [tipos, setTipos] = useState<TipoMov[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nombre: "", naturaleza: "INGRESO", cuenta_contable: "", recurrente: false });
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await fetch("/api/configuracion/tipos-movimiento");
    setTipos(await r.json());
  }

  useEffect(() => { fetch("/api/configuracion/tipos-movimiento").then(r => r.json()).then(setTipos); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/configuracion/tipos-movimiento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ nombre: "", naturaleza: "INGRESO", cuenta_contable: "", recurrente: false });
    setShowForm(false);
    setSaving(false);
    load();
  }

  async function handleToggle(id: number, activo: boolean) {
    await fetch(`/api/configuracion/tipos-movimiento/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !activo }),
    });
    load();
  }

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/configuracion" className="text-xs text-[var(--muted)] hover:underline">← Configuración</Link>
          <h2 className="mt-1 text-2xl font-semibold">Tipos de movimiento</h2>
          <p className="text-sm text-[var(--muted)]">Categorías de movimientos de tesorería</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">+ Crear</button>
      </header>

      {showForm && (
        <form onSubmit={handleCreate} className="card p-5 space-y-4">
          <h3 className="font-semibold">Nuevo tipo de movimiento</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Nombre *</label>
              <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required
                placeholder="Pago honorarios, Cobro cuota..." className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Naturaleza *</label>
              <select value={form.naturaleza} onChange={e => setForm({ ...form, naturaleza: e.target.value })}
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm">
                <option value="INGRESO">Ingreso</option>
                <option value="EGRESO">Egreso</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Cuenta contable</label>
              <input value={form.cuenta_contable} onChange={e => setForm({ ...form, cuenta_contable: e.target.value })}
                placeholder="1-1-01" className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" id="recurrente" checked={form.recurrente}
                onChange={e => setForm({ ...form, recurrente: e.target.checked })} />
              <label htmlFor="recurrente" className="text-sm">Es recurrente</label>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "Guardando..." : "Guardar"}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">Cancelar</button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Nombre</th>
              <th className="table-cell text-left font-medium">Naturaleza</th>
              <th className="table-cell text-left font-medium">Cuenta contable</th>
              <th className="table-cell text-center font-medium">Recurrente</th>
              <th className="table-cell text-left font-medium">Estado</th>
              <th className="table-cell text-left font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {tipos.map(t => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="table-cell font-medium">{t.nombre}</td>
                <td className="table-cell">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${t.naturaleza === "INGRESO" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                    {t.naturaleza}
                  </span>
                </td>
                <td className="table-cell text-[var(--muted)]">{t.cuenta_contable ?? "—"}</td>
                <td className="table-cell text-center">{t.recurrente ? "✓" : "—"}</td>
                <td className="table-cell">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${t.activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {t.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="table-cell">
                  <button onClick={() => handleToggle(t.id, t.activo)}
                    className={`text-xs hover:underline ${t.activo ? "text-amber-600" : "text-emerald-600"}`}>
                    {t.activo ? "Desactivar" : "Activar"}
                  </button>
                </td>
              </tr>
            ))}
            {tipos.length === 0 && <tr><td colSpan={6} className="table-cell text-center text-[var(--muted)]">Sin tipos configurados</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
