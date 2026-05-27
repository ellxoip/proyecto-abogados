"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

interface Proveedor {
  id: number; rut: string; nombre: string; razon_social: string | null;
  giro: string | null; email: string | null; telefono: string | null;
  categoria: string | null; activo: boolean;
  _count: { gastos: number; documentos: number };
}

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ rut: "", nombre: "", razon_social: "", giro: "", email: "", telefono: "", categoria: "", banco: "", numero_cuenta: "" });
  const [saving, setSaving] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  async function load() {
    const r = await fetch("/api/compras/proveedores");
    setProveedores(await r.json());
  }
  useEffect(() => { fetch("/api/compras/proveedores").then(r => r.json()).then(setProveedores); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/compras/proveedores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false); setShowForm(false);
    setForm({ rut: "", nombre: "", razon_social: "", giro: "", email: "", telefono: "", categoria: "", banco: "", numero_cuenta: "" });
    load();
  }

  const filtered = proveedores.filter(p => !busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || p.rut.includes(busqueda));

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Proveedores</h2>
          <p className="text-sm text-[var(--muted)]">Registro de proveedores y sus datos</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Nuevo proveedor
        </button>
      </header>

      {showForm && (
        <form onSubmit={submit} className="card p-5 space-y-4">
          <h3 className="font-semibold">Nuevo proveedor</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">RUT *</label>
              <input required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" placeholder="12345678-9" value={form.rut} onChange={e => setForm(f => ({ ...f, rut: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Nombre *</label>
              <input required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Razón social</label>
              <input className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.razon_social} onChange={e => setForm(f => ({ ...f, razon_social: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Giro</label>
              <input className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.giro} onChange={e => setForm(f => ({ ...f, giro: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Email</label>
              <input type="email" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Teléfono</label>
              <input className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Banco</label>
              <input className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.banco} onChange={e => setForm(f => ({ ...f, banco: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">N° cuenta</label>
              <input className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.numero_cuenta} onChange={e => setForm(f => ({ ...f, numero_cuenta: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">{saving ? "Guardando..." : "Crear proveedor"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50">Cancelar</button>
          </div>
        </form>
      )}

      <div>
        <input placeholder="Buscar por nombre o RUT..." className="w-full max-w-sm rounded border border-[var(--border)] px-3 py-2 text-sm" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">RUT</th>
              <th className="table-cell text-left font-medium">Nombre</th>
              <th className="table-cell text-left font-medium">Giro</th>
              <th className="table-cell text-left font-medium">Contacto</th>
              <th className="table-cell text-center font-medium">Gastos</th>
              <th className="table-cell text-center font-medium">Docs</th>
              <th className="table-cell text-center font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {filtered.map(p => (
              <tr key={p.id} className={`hover:bg-slate-50 ${!p.activo ? "opacity-50" : ""}`}>
                <td className="table-cell font-mono text-xs">{p.rut}</td>
                <td className="table-cell font-medium">{p.nombre}</td>
                <td className="table-cell text-[var(--muted)]">{p.giro ?? "—"}</td>
                <td className="table-cell">
                  {p.email && <p className="text-xs">{p.email}</p>}
                  {p.telefono && <p className="text-xs text-[var(--muted)]">{p.telefono}</p>}
                </td>
                <td className="table-cell text-center">{p._count.gastos}</td>
                <td className="table-cell text-center">{p._count.documentos}</td>
                <td className="table-cell text-center">
                  <Link href={`/compras/proveedores/${p.id}`} className="text-xs text-[var(--accent)] hover:underline">Ver</Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="table-cell text-center text-[var(--muted)]">Sin proveedores.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
