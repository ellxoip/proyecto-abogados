"use client";
import { useEffect, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";

interface Fondo { id: number; nombre: string; saldo_actual: string; }
interface Gasto {
  id: number; descripcion: string; monto: string; fecha_gasto: string;
  categoria: string; comprobante_numero: string | null;
  fondo: { nombre: string };
  responsable: { nombre: string };
}

export default function GastosPage() {
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [fondos, setFondos] = useState<Fondo[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [fondoFiltro, setFondoFiltro] = useState("");
  const [form, setForm] = useState({ fondo_id: "", descripcion: "", monto: "", fecha_gasto: new Date().toISOString().slice(0, 10), categoria: "", comprobante_numero: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const params = new URLSearchParams();
    if (fondoFiltro) params.set("fondo_id", fondoFiltro);
    const r = await fetch("/api/tesoreria/caja-chica/gastos?" + params);
    setGastos(await r.json());
  }
  async function loadFondos() {
    const r = await fetch("/api/tesoreria/caja-chica/fondos");
    setFondos(await r.json());
  }
  useEffect(() => { fetch("/api/tesoreria/caja-chica/fondos").then(r => r.json()).then(setFondos); }, []);
  useEffect(() => {
    const params = new URLSearchParams();
    if (fondoFiltro) params.set("fondo_id", fondoFiltro);
    fetch("/api/tesoreria/caja-chica/gastos?" + params).then(r => r.json()).then(setGastos);
  }, [fondoFiltro]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    const r = await fetch("/api/tesoreria/caja-chica/gastos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, monto: Number(form.monto), fondo_id: Number(form.fondo_id) }),
    });
    if (!r.ok) {
      const d = await r.json();
      setError(d.error || "Error al registrar gasto");
    } else {
      setShowForm(false);
      setForm({ fondo_id: "", descripcion: "", monto: "", fecha_gasto: new Date().toISOString().slice(0, 10), categoria: "", comprobante_numero: "" });
      load(); loadFondos();
    }
    setSaving(false);
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Gastos de caja chica</h2>
          <p className="text-sm text-[var(--muted)]">Registrar gastos menores por fondo</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Registrar gasto
        </button>
      </header>

      {fondos.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {fondos.map(f => (
            <div key={f.id} className="rounded bg-slate-50 border border-[var(--border)] px-3 py-1.5 text-xs">
              <span className="font-medium">{f.nombre}</span>
              <span className="ml-2 text-emerald-600">{formatCurrency(Number(f.saldo_actual))}</span>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="card p-5 space-y-4">
          <h3 className="font-semibold">Nuevo gasto</h3>
          {error && <p className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Fondo *</label>
              <select required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.fondo_id} onChange={e => setForm(f => ({ ...f, fondo_id: e.target.value }))}>
                <option value="">Seleccionar...</option>
                {fondos.map(f => <option key={f.id} value={f.id}>{f.nombre} — {formatCurrency(Number(f.saldo_actual))}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Fecha *</label>
              <input required type="date" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.fecha_gasto} onChange={e => setForm(f => ({ ...f, fecha_gasto: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-[var(--muted)] mb-1">Descripción *</label>
              <input required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Monto *</label>
              <input required type="number" min="1" step="1" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Categoría</label>
              <select className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                <option value="">Sin categoría</option>
                <option>Útiles de oficina</option>
                <option>Limpieza</option>
                <option>Alimentación</option>
                <option>Transporte</option>
                <option>Comunicaciones</option>
                <option>Otros</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">N° comprobante</label>
              <input className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.comprobante_numero} onChange={e => setForm(f => ({ ...f, comprobante_numero: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {saving ? "Registrando..." : "Registrar gasto"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50">
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="mb-4">
        <select className="rounded border border-[var(--border)] px-3 py-2 text-sm" value={fondoFiltro} onChange={e => setFondoFiltro(e.target.value)}>
          <option value="">Todos los fondos</option>
          {fondos.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Fecha</th>
              <th className="table-cell text-left font-medium">Descripción</th>
              <th className="table-cell text-left font-medium">Fondo</th>
              <th className="table-cell text-left font-medium">Categoría</th>
              <th className="table-cell text-left font-medium">Registrado por</th>
              <th className="table-cell text-right font-medium">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {gastos.map(g => (
              <tr key={g.id} className="hover:bg-slate-50">
                <td className="table-cell">{formatDate(g.fecha_gasto)}</td>
                <td className="table-cell">
                  <p>{g.descripcion}</p>
                  {g.comprobante_numero && <p className="text-xs text-[var(--muted)]">Boleta #{g.comprobante_numero}</p>}
                </td>
                <td className="table-cell">{g.fondo.nombre}</td>
                <td className="table-cell">{g.categoria || <span className="text-[var(--muted)]">—</span>}</td>
                <td className="table-cell">{g.responsable.nombre}</td>
                <td className="table-cell text-right font-medium">{formatCurrency(Number(g.monto))}</td>
              </tr>
            ))}
            {gastos.length === 0 && (
              <tr><td colSpan={6} className="table-cell text-center text-[var(--muted)]">Sin gastos registrados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
