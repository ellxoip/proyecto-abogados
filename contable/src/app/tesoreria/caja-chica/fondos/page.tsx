"use client";
import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";

interface Usuario { id: number; nombre: string; }
interface Fondo {
  id: number; nombre: string; monto_asignado: string; saldo_actual: string;
  descripcion: string | null; activo: boolean;
  responsable: { nombre: string };
  _count?: { gastos: number };
}

export default function FondosPage() {
  const [fondos, setFondos] = useState<Fondo[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nombre: "", monto_asignado: "", responsable_id: "", descripcion: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await fetch("/api/tesoreria/caja-chica/fondos");
    setFondos(await r.json());
  }
  useEffect(() => {
    fetch("/api/tesoreria/caja-chica/fondos").then(r => r.json()).then(setFondos);
    fetch("/api/usuarios").then(r => r.json()).then(setUsuarios);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/tesoreria/caja-chica/fondos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, monto_asignado: Number(form.monto_asignado), responsable_id: Number(form.responsable_id) }),
    });
    setSaving(false);
    setShowForm(false);
    setForm({ nombre: "", monto_asignado: "", responsable_id: "", descripcion: "" });
    load();
  }

  async function toggleActivo(id: number, activo: boolean) {
    await fetch(`/api/tesoreria/caja-chica/fondos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !activo }),
    });
    load();
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Fondos de caja chica</h2>
          <p className="text-sm text-[var(--muted)]">Crear y administrar fondos para gastos menores</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Nuevo fondo
        </button>
      </header>

      {showForm && (
        <form onSubmit={submit} className="card p-5 space-y-4">
          <h3 className="font-semibold">Nuevo fondo</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Nombre *</label>
              <input required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Monto asignado *</label>
              <input required type="number" min="0" step="1" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.monto_asignado} onChange={e => setForm(f => ({ ...f, monto_asignado: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Responsable *</label>
              <select required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.responsable_id} onChange={e => setForm(f => ({ ...f, responsable_id: e.target.value }))}>
                <option value="">Seleccionar...</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Descripción</label>
              <input className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {saving ? "Guardando..." : "Crear fondo"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50">
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {fondos.map(f => {
          const asignado = Number(f.monto_asignado);
          const actual = Number(f.saldo_actual);
          const usado = asignado - actual;
          const pct = asignado > 0 ? (actual / asignado) * 100 : 0;
          return (
            <div key={f.id} className={`card p-5 space-y-3 ${!f.activo ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{f.nombre}</h3>
                  <p className="text-xs text-[var(--muted)]">Responsable: {f.responsable.nombre}</p>
                  {f.descripcion && <p className="text-xs text-[var(--muted)] mt-0.5">{f.descripcion}</p>}
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${f.activo ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {f.activo ? "Activo" : "Inactivo"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded bg-slate-50 p-2">
                  <p className="text-xs text-[var(--muted)]">Asignado</p>
                  <p className="text-sm font-semibold">{formatCurrency(asignado)}</p>
                </div>
                <div className="rounded bg-emerald-50 p-2">
                  <p className="text-xs text-[var(--muted)]">Disponible</p>
                  <p className="text-sm font-semibold text-emerald-700">{formatCurrency(actual)}</p>
                </div>
                <div className="rounded bg-amber-50 p-2">
                  <p className="text-xs text-[var(--muted)]">Usado</p>
                  <p className="text-sm font-semibold text-amber-700">{formatCurrency(usado)}</p>
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-[var(--muted)]">
                  <span>Disponibilidad</span>
                  <span>{pct.toFixed(0)}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-200">
                  <div className={`h-2 rounded-full ${pct > 50 ? "bg-emerald-500" : pct > 20 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <a href={`/tesoreria/caja-chica/gastos?fondo=${f.id}`} className="text-xs text-[var(--accent)] hover:underline">Ver gastos</a>
                <span className="text-xs text-[var(--muted)]">·</span>
                <button onClick={() => toggleActivo(f.id, f.activo)} className="text-xs text-[var(--muted)] hover:text-slate-700">
                  {f.activo ? "Desactivar" : "Activar"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {fondos.length === 0 && (
        <div className="card p-8 text-center text-sm text-[var(--muted)]">Sin fondos configurados.</div>
      )}
    </section>
  );
}
