"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";

type Cuenta = {
  id: number;
  nombre: string;
  numero_cuenta: string;
  tipo_cuenta: string;
  moneda: string;
  saldo_inicial: string;
  activa: boolean;
  cuenta_principal: boolean;
  banco: { id: number; nombre: string };
};

type Banco = { id: number; nombre: string };

const TIPOS_CUENTA = ["CORRIENTE", "AHORRO", "VISTA", "CREDITO"];

export default function CuentasBancariasPage() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ banco_id: "", nombre: "", numero_cuenta: "", tipo_cuenta: "CORRIENTE", moneda: "CLP", saldo_inicial: "0", cuenta_principal: false });
  const [saving, setSaving] = useState(false);

  async function load() {
    const [rc, rb] = await Promise.all([
      fetch("/api/tesoreria/cuentas").then((r) => r.json()),
      fetch("/api/tesoreria/bancos").then((r) => r.json()),
    ]);
    setCuentas(rc);
    setBancos(rb);
    setLoading(false);
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/tesoreria/cuentas").then(r => r.json()),
      fetch("/api/tesoreria/bancos").then(r => r.json()),
    ]).then(([rc, rb]) => { setCuentas(rc); setBancos(rb); setLoading(false); });
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/tesoreria/cuentas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, banco_id: Number(form.banco_id), saldo_inicial: Number(form.saldo_inicial) }),
    });
    setShowForm(false);
    setSaving(false);
    load();
  }

  async function toggleActiva(id: number, activa: boolean) {
    await fetch(`/api/tesoreria/cuentas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activa: !activa }),
    });
    load();
  }

  if (loading) return <div className="text-sm text-[var(--muted)]">Cargando...</div>;

  return (
    <section className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Cuentas bancarias</h2>
          <p className="text-sm text-[var(--muted)]">Cuentas del estudio con saldos y detalles</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          disabled={bancos.length === 0}
          title={bancos.length === 0 ? "Agrega un banco primero" : ""}
        >
          + Agregar cuenta
        </button>
      </header>

      {bancos.length === 0 && (
        <div className="card p-4 text-sm text-amber-700 bg-amber-50 border-amber-200">
          Agrega un banco primero en <a href="/tesoreria/bancos" className="underline">Bancos</a>.
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="card p-5 space-y-4">
          <h3 className="font-semibold">Nueva cuenta bancaria</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Banco *</label>
              <select value={form.banco_id} onChange={(e) => setForm({ ...form, banco_id: e.target.value })} required className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm">
                <option value="">Seleccionar...</option>
                {bancos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Nombre *</label>
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required placeholder="Cuenta corriente operaciones" className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">N° cuenta *</label>
              <input value={form.numero_cuenta} onChange={(e) => setForm({ ...form, numero_cuenta: e.target.value })} required placeholder="12345678" className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Tipo *</label>
              <select value={form.tipo_cuenta} onChange={(e) => setForm({ ...form, tipo_cuenta: e.target.value })} className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm">
                {TIPOS_CUENTA.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Saldo inicial</label>
              <input type="number" value={form.saldo_inicial} onChange={(e) => setForm({ ...form, saldo_inicial: e.target.value })} className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.cuenta_principal} onChange={(e) => setForm({ ...form, cuenta_principal: e.target.checked })} />
                Cuenta principal
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "Guardando..." : "Guardar"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">Cancelar</button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--muted)]">
            <tr>
              <th className="table-cell font-medium">Nombre</th>
              <th className="table-cell font-medium">Banco</th>
              <th className="table-cell font-medium">N° cuenta</th>
              <th className="table-cell font-medium">Tipo</th>
              <th className="table-cell font-medium">Moneda</th>
              <th className="table-cell font-medium text-right">Saldo inicial</th>
              <th className="table-cell font-medium">Estado</th>
              <th className="table-cell font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cuentas.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="table-cell font-medium">
                  {c.nombre}
                  {c.cuenta_principal && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">Principal</span>}
                </td>
                <td className="table-cell">{c.banco.nombre}</td>
                <td className="table-cell font-mono text-xs">{c.numero_cuenta}</td>
                <td className="table-cell">{c.tipo_cuenta}</td>
                <td className="table-cell">{c.moneda}</td>
                <td className="table-cell text-right font-medium">{formatCurrency(Number(c.saldo_inicial))}</td>
                <td className="table-cell">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.activa ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {c.activa ? "Activa" : "Inactiva"}
                  </span>
                </td>
                <td className="table-cell">
                  <button onClick={() => toggleActiva(c.id, c.activa)} className="text-xs text-[var(--accent)] hover:underline">
                    {c.activa ? "Desactivar" : "Activar"}
                  </button>
                </td>
              </tr>
            ))}
            {cuentas.length === 0 && (
              <tr><td colSpan={8} className="table-cell text-center text-[var(--muted)]">Sin cuentas registradas</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
