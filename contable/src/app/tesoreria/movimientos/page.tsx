"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";

type Movimiento = {
  id: number;
  tipo: "INGRESO" | "EGRESO";
  categoria: string | null;
  descripcion: string;
  monto: string;
  fecha_movimiento: string;
  referencia: string | null;
  conciliado: boolean;
  cuenta: { id: number; nombre: string; banco: { nombre: string } };
};

type Cuenta = { id: number; nombre: string; banco: { nombre: string } };

export default function MovimientosPage() {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({ cuenta_id: "", tipo: "", desde: "", hasta: "" });
  const [form, setForm] = useState({ cuenta_id: "", tipo: "INGRESO", categoria: "", descripcion: "", monto: "", fecha_movimiento: new Date().toISOString().slice(0, 10), referencia: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    const params = new URLSearchParams();
    if (filters.cuenta_id) params.set("cuenta_id", filters.cuenta_id);
    if (filters.tipo) params.set("tipo", filters.tipo);
    if (filters.desde) params.set("desde", filters.desde);
    if (filters.hasta) params.set("hasta", filters.hasta);
    const [rm, rc] = await Promise.all([
      fetch(`/api/tesoreria/movimientos?${params}`).then((r) => r.json()),
      fetch("/api/tesoreria/cuentas").then((r) => r.json()),
    ]);
    setMovimientos(rm);
    setCuentas(rc);
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/tesoreria/movimientos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, cuenta_id: Number(form.cuenta_id), monto: Number(form.monto) }),
    });
    setShowForm(false);
    setSaving(false);
    load();
  }

  const totalIngresos = movimientos.filter((m) => m.tipo === "INGRESO").reduce((s, m) => s + Number(m.monto), 0);
  const totalEgresos = movimientos.filter((m) => m.tipo === "EGRESO").reduce((s, m) => s + Number(m.monto), 0);

  if (loading) return <div className="text-sm text-[var(--muted)]">Cargando...</div>;

  return (
    <section className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Movimientos</h2>
          <p className="text-sm text-[var(--muted)]">Registro de ingresos y egresos bancarios</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          + Registrar movimiento
        </button>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Total ingresos (filtrado)</p>
          <p className="mt-1 text-xl font-bold text-emerald-600">{formatCurrency(totalIngresos)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Total egresos (filtrado)</p>
          <p className="mt-1 text-xl font-bold text-rose-600">{formatCurrency(totalEgresos)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Saldo neto</p>
          <p className={`mt-1 text-xl font-bold ${totalIngresos - totalEgresos >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {formatCurrency(totalIngresos - totalEgresos)}
          </p>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card p-5 space-y-4">
          <h3 className="font-semibold">Nuevo movimiento</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Cuenta *</label>
              <select value={form.cuenta_id} onChange={(e) => setForm({ ...form, cuenta_id: e.target.value })} required className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm">
                <option value="">Seleccionar...</option>
                {cuentas.map((c) => <option key={c.id} value={c.id}>{c.banco.nombre} — {c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Tipo *</label>
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm">
                <option value="INGRESO">Ingreso</option>
                <option value="EGRESO">Egreso</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Categoría</label>
              <input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Honorarios, Arriendo..." className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Descripción *</label>
              <input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} required placeholder="Descripción del movimiento" className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Monto *</label>
              <input type="number" step="0.01" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} required className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Fecha *</label>
              <input type="date" value={form.fecha_movimiento} onChange={(e) => setForm({ ...form, fecha_movimiento: e.target.value })} required className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Referencia</label>
              <input value={form.referencia} onChange={(e) => setForm({ ...form, referencia: e.target.value })} placeholder="N° transferencia..." className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "Guardando..." : "Registrar"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">Cancelar</button>
          </div>
        </form>
      )}

      <form className="card p-4" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <div className="flex flex-wrap gap-3">
          <select value={filters.cuenta_id} onChange={(e) => setFilters({ ...filters, cuenta_id: e.target.value })} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
            <option value="">Todas las cuentas</option>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.banco.nombre} — {c.nombre}</option>)}
          </select>
          <select value={filters.tipo} onChange={(e) => setFilters({ ...filters, tipo: e.target.value })} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
            <option value="">Todos los tipos</option>
            <option value="INGRESO">Ingresos</option>
            <option value="EGRESO">Egresos</option>
          </select>
          <input type="date" value={filters.desde} onChange={(e) => setFilters({ ...filters, desde: e.target.value })} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
          <input type="date" value={filters.hasta} onChange={(e) => setFilters({ ...filters, hasta: e.target.value })} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
          <button type="submit" className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white">Filtrar</button>
        </div>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--muted)]">
            <tr>
              <th className="table-cell font-medium">Fecha</th>
              <th className="table-cell font-medium">Cuenta</th>
              <th className="table-cell font-medium">Tipo</th>
              <th className="table-cell font-medium">Categoría</th>
              <th className="table-cell font-medium">Descripción</th>
              <th className="table-cell font-medium">Referencia</th>
              <th className="table-cell font-medium">Conciliado</th>
              <th className="table-cell font-medium text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="table-cell">{new Date(m.fecha_movimiento).toLocaleDateString("es-CL")}</td>
                <td className="table-cell text-xs">{m.cuenta.banco.nombre}<br />{m.cuenta.nombre}</td>
                <td className="table-cell">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.tipo === "INGRESO" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                    {m.tipo}
                  </span>
                </td>
                <td className="table-cell text-[var(--muted)]">{m.categoria ?? "—"}</td>
                <td className="table-cell">{m.descripcion}</td>
                <td className="table-cell text-xs text-[var(--muted)]">{m.referencia ?? "—"}</td>
                <td className="table-cell">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${m.conciliado ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {m.conciliado ? "Sí" : "No"}
                  </span>
                </td>
                <td className={`table-cell text-right font-semibold ${m.tipo === "INGRESO" ? "text-emerald-600" : "text-rose-600"}`}>
                  {m.tipo === "INGRESO" ? "+" : "-"}{formatCurrency(Number(m.monto))}
                </td>
              </tr>
            ))}
            {movimientos.length === 0 && (
              <tr><td colSpan={8} className="table-cell text-center text-[var(--muted)]">Sin movimientos</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
