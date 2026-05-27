"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";

type Banco = {
  id: number;
  nombre: string;
  codigo_banco: string | null;
  activo: boolean;
  cuentas: { id: number; nombre: string; numero_cuenta: string; tipo_cuenta: string; saldo_inicial: string }[];
};

export default function BancosPage() {
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await fetch("/api/tesoreria/bancos");
    setBancos(await r.json());
    setLoading(false);
  }

  useEffect(() => { fetch("/api/tesoreria/bancos").then(r => r.json()).then(data => { setBancos(data); setLoading(false); }); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/tesoreria/bancos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, codigo_banco: codigo || null }),
    });
    setNombre(""); setCodigo(""); setShowForm(false); setSaving(false);
    load();
  }

  async function handleDesactivar(id: number) {
    if (!confirm("¿Desactivar banco?")) return;
    await fetch(`/api/tesoreria/bancos/${id}`, { method: "DELETE" });
    load();
  }

  if (loading) return <div className="text-sm text-[var(--muted)]">Cargando...</div>;

  return (
    <section className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Bancos</h2>
          <p className="text-sm text-[var(--muted)]">Instituciones bancarias vinculadas al estudio</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + Agregar banco
        </button>
      </header>

      {showForm && (
        <form onSubmit={handleCreate} className="card p-5 space-y-4">
          <h3 className="font-semibold">Nuevo banco</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Nombre *</label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
                placeholder="Banco Estado, Santander..."
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Código banco</label>
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="001, 012..."
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "Guardando..." : "Guardar"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--muted)]">
            <tr>
              <th className="table-cell font-medium">Banco</th>
              <th className="table-cell font-medium">Código</th>
              <th className="table-cell font-medium">Cuentas activas</th>
              <th className="table-cell font-medium">Saldo total</th>
              <th className="table-cell font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {bancos.map((b) => (
              <tr key={b.id} className="hover:bg-slate-50">
                <td className="table-cell font-medium">{b.nombre}</td>
                <td className="table-cell text-[var(--muted)]">{b.codigo_banco ?? "—"}</td>
                <td className="table-cell">{b.cuentas.length}</td>
                <td className="table-cell font-medium">
                  {formatCurrency(b.cuentas.reduce((s, c) => s + Number(c.saldo_inicial), 0))}
                </td>
                <td className="table-cell">
                  <button
                    onClick={() => handleDesactivar(b.id)}
                    className="text-xs text-rose-500 hover:underline"
                  >
                    Desactivar
                  </button>
                </td>
              </tr>
            ))}
            {bancos.length === 0 && (
              <tr>
                <td colSpan={5} className="table-cell text-center text-[var(--muted)]">
                  Sin bancos configurados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
