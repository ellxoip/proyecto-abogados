"use client";
import { useEffect, useState } from "react";

interface Cuenta {
  id: number; codigo: string; nombre: string; tipo: string; naturaleza: string;
  nivel: number; acepta_movimientos: boolean; activa: boolean;
  cuenta_padre: { codigo: string; nombre: string } | null;
}

const TIPO_COLOR: Record<string, string> = {
  ACTIVO: "bg-blue-100 text-blue-700", PASIVO: "bg-rose-100 text-rose-700",
  PATRIMONIO: "bg-purple-100 text-purple-700", INGRESO: "bg-emerald-100 text-emerald-700",
  GASTO: "bg-amber-100 text-amber-700", COSTO: "bg-orange-100 text-orange-700",
};

export default function PlanCuentasPage() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [form, setForm] = useState({ codigo: "", nombre: "", tipo: "ACTIVO", naturaleza: "DEUDORA", nivel: "1", cuenta_padre_id: "", acepta_movimientos: true });
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await fetch("/api/contabilidad/cuentas");
    setCuentas(await r.json());
  }
  useEffect(() => { fetch("/api/contabilidad/cuentas").then(r => r.json()).then(setCuentas); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/contabilidad/cuentas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, nivel: Number(form.nivel), cuenta_padre_id: form.cuenta_padre_id ? Number(form.cuenta_padre_id) : null }) });
    setSaving(false); setShowForm(false);
    setForm({ codigo: "", nombre: "", tipo: "ACTIVO", naturaleza: "DEUDORA", nivel: "1", cuenta_padre_id: "", acepta_movimientos: true });
    load();
  }

  const filtered = cuentas.filter(c => !busqueda || c.codigo.includes(busqueda) || c.nombre.toLowerCase().includes(busqueda.toLowerCase()));

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Plan de cuentas</h2>
          <p className="text-sm text-[var(--muted)]">Árbol jerárquico de cuentas contables</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">Nueva cuenta</button>
      </header>

      {showForm && (
        <form onSubmit={submit} className="card p-5 space-y-4">
          <h3 className="font-semibold">Nueva cuenta contable</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Código *</label>
              <input required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" placeholder="1.1.01" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-[var(--muted)] mb-1">Nombre *</label>
              <input required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Tipo *</label>
              <select required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                <option value="ACTIVO">Activo</option>
                <option value="PASIVO">Pasivo</option>
                <option value="PATRIMONIO">Patrimonio</option>
                <option value="INGRESO">Ingreso</option>
                <option value="GASTO">Gasto</option>
                <option value="COSTO">Costo</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Naturaleza *</label>
              <select required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.naturaleza} onChange={e => setForm(f => ({ ...f, naturaleza: e.target.value }))}>
                <option value="DEUDORA">Deudora</option>
                <option value="ACREEDORA">Acreedora</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Nivel</label>
              <input type="number" min="1" max="5" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.nivel} onChange={e => setForm(f => ({ ...f, nivel: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Cuenta padre</label>
              <select className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.cuenta_padre_id} onChange={e => setForm(f => ({ ...f, cuenta_padre_id: e.target.value }))}>
                <option value="">Sin padre</option>
                {cuentas.filter(c => !c.acepta_movimientos || Number(form.nivel) > 1).map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="acepta_mov" checked={form.acepta_movimientos} onChange={e => setForm(f => ({ ...f, acepta_movimientos: e.target.checked }))} />
              <label htmlFor="acepta_mov" className="text-sm">Acepta movimientos</label>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">{saving ? "Guardando..." : "Crear cuenta"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50">Cancelar</button>
          </div>
        </form>
      )}

      <div>
        <input placeholder="Buscar por código o nombre..." className="w-full max-w-sm rounded border border-[var(--border)] px-3 py-2 text-sm" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Código</th>
              <th className="table-cell text-left font-medium">Nombre</th>
              <th className="table-cell text-left font-medium">Tipo</th>
              <th className="table-cell text-left font-medium">Naturaleza</th>
              <th className="table-cell text-left font-medium">Cuenta padre</th>
              <th className="table-cell text-center font-medium">Nivel</th>
              <th className="table-cell text-center font-medium">Mov.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {filtered.map(c => (
              <tr key={c.id} className={`hover:bg-slate-50 ${!c.activa ? "opacity-50" : ""}`}>
                <td className="table-cell font-mono font-medium">{c.codigo}</td>
                <td className="table-cell" style={{ paddingLeft: `${(c.nivel - 1) * 16 + 12}px` }}>{c.nombre}</td>
                <td className="table-cell">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${TIPO_COLOR[c.tipo] ?? ""}`}>{c.tipo}</span>
                </td>
                <td className="table-cell">{c.naturaleza}</td>
                <td className="table-cell text-[var(--muted)]">{c.cuenta_padre ? `${c.cuenta_padre.codigo} — ${c.cuenta_padre.nombre}` : "—"}</td>
                <td className="table-cell text-center">{c.nivel}</td>
                <td className="table-cell text-center">{c.acepta_movimientos ? "✓" : "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7} className="table-cell text-center text-[var(--muted)]">Sin cuentas.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
