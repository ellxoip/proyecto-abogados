"use client";
import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";

interface ReglaFacturacion {
  id: number; nombre: string; periodicidad: string; dia_emision: number;
  monto: string; activa: boolean;
  cliente: { nombre: string };
  servicio: { nombre: string; precio_base: string } | null;
}
interface Cliente { id: number; nombre: string; }
interface Servicio { id: number; nombre: string; precio_base: string; }

export default function RecurrentePage() {
  const [reglas, setReglas] = useState<ReglaFacturacion[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ cliente_id: "", servicio_id: "", nombre: "", periodicidad: "MENSUAL", dia_emision: "1", monto: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await fetch("/api/ventas/recurrente");
    setReglas(await r.json());
  }
  useEffect(() => {
    fetch("/api/ventas/recurrente").then(r => r.json()).then(setReglas);
    fetch("/api/clientes").then(r => r.json()).then(setClientes);
    fetch("/api/ventas/servicios").then(r => r.json()).then(setServicios);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/ventas/recurrente", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, cliente_id: Number(form.cliente_id), servicio_id: form.servicio_id ? Number(form.servicio_id) : null, dia_emision: Number(form.dia_emision), monto: Number(form.monto) }),
    });
    setSaving(false); setShowForm(false);
    setForm({ cliente_id: "", servicio_id: "", nombre: "", periodicidad: "MENSUAL", dia_emision: "1", monto: "" });
    load();
  }

  async function toggleActiva(id: number, activa: boolean) {
    await fetch(`/api/ventas/recurrente/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activa: !activa }) });
    load();
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Facturación recurrente</h2>
          <p className="text-sm text-[var(--muted)]">Reglas automáticas de emisión de documentos</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Nueva regla
        </button>
      </header>

      {showForm && (
        <form onSubmit={submit} className="card p-5 space-y-4">
          <h3 className="font-semibold">Nueva regla de facturación</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Nombre *</label>
              <input required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Cliente *</label>
              <select required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.cliente_id} onChange={e => setForm(f => ({ ...f, cliente_id: e.target.value }))}>
                <option value="">Seleccionar...</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Servicio</label>
              <select className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.servicio_id} onChange={e => { const s = servicios.find(s => s.id === Number(e.target.value)); setForm(f => ({ ...f, servicio_id: e.target.value, monto: s ? s.precio_base : f.monto })); }}>
                <option value="">Sin servicio específico</option>
                {servicios.map(s => <option key={s.id} value={s.id}>{s.nombre} — {formatCurrency(Number(s.precio_base))}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Periodicidad *</label>
              <select required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.periodicidad} onChange={e => setForm(f => ({ ...f, periodicidad: e.target.value }))}>
                <option value="MENSUAL">Mensual</option>
                <option value="BIMESTRAL">Bimestral</option>
                <option value="TRIMESTRAL">Trimestral</option>
                <option value="SEMESTRAL">Semestral</option>
                <option value="ANUAL">Anual</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Día de emisión (1-28) *</label>
              <input required type="number" min="1" max="28" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.dia_emision} onChange={e => setForm(f => ({ ...f, dia_emision: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Monto *</label>
              <input required type="number" min="0" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {saving ? "Guardando..." : "Crear regla"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50">Cancelar</button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Nombre</th>
              <th className="table-cell text-left font-medium">Cliente</th>
              <th className="table-cell text-left font-medium">Servicio</th>
              <th className="table-cell text-left font-medium">Periodicidad</th>
              <th className="table-cell text-right font-medium">Monto</th>
              <th className="table-cell text-center font-medium">Estado</th>
              <th className="table-cell text-center font-medium">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {reglas.map(r => (
              <tr key={r.id} className={`hover:bg-slate-50 ${!r.activa ? "opacity-50" : ""}`}>
                <td className="table-cell font-medium">{r.nombre}</td>
                <td className="table-cell">{r.cliente.nombre}</td>
                <td className="table-cell">{r.servicio?.nombre ?? <span className="text-[var(--muted)]">—</span>}</td>
                <td className="table-cell">{r.periodicidad} (día {r.dia_emision})</td>
                <td className="table-cell text-right">{formatCurrency(Number(r.monto))}</td>
                <td className="table-cell text-center">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${r.activa ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {r.activa ? "Activa" : "Inactiva"}
                  </span>
                </td>
                <td className="table-cell text-center">
                  <button onClick={() => toggleActiva(r.id, r.activa)} className="text-xs text-[var(--accent)] hover:underline">
                    {r.activa ? "Desactivar" : "Activar"}
                  </button>
                </td>
              </tr>
            ))}
            {reglas.length === 0 && (
              <tr><td colSpan={7} className="table-cell text-center text-[var(--muted)]">Sin reglas configuradas.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
