"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Usuario = {
  id: number;
  nombre: string;
  email: string;
  rol: string;
  activo: boolean;
  empresa_id: number | null;
  created_at: string;
};

const ROLES = ["ADMIN","CONTADOR","ANALISTA","SOLO_LECTURA"];

export default function AdminUsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nombre: "", email: "", password: "", rol: "CONTADOR" });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Usuario | null>(null);
  const [editRol, setEditRol] = useState("CONTADOR");

  async function load() {
    const r = await fetch("/api/usuarios");
    setUsuarios(await r.json());
    setLoading(false);
  }

  useEffect(() => { fetch("/api/usuarios").then(r => r.json()).then(data => { setUsuarios(data); setLoading(false); }); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ nombre: "", email: "", password: "", rol: "CONTADOR" });
    setShowForm(false);
    setSaving(false);
    load();
  }

  async function handleToggle(id: number, activo: boolean) {
    await fetch(`/api/usuarios/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !activo }),
    });
    load();
  }

  async function handleEditRol() {
    if (!editing) return;
    setSaving(true);
    await fetch(`/api/usuarios/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rol: editRol }),
    });
    setEditing(null);
    setSaving(false);
    load();
  }

  const admins = usuarios.filter(u => u.rol === "ADMIN");
  const activos = usuarios.filter(u => u.activo);

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/administracion" className="text-xs text-[var(--muted)] hover:underline">← Administración</Link>
          <h2 className="mt-1 text-2xl font-semibold">Usuarios globales</h2>
          <p className="text-sm text-[var(--muted)]">Usuarios con acceso al sistema</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">+ Crear usuario</button>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Total usuarios</p>
          <p className="mt-1 text-2xl font-bold">{usuarios.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Usuarios activos</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{activos.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Administradores</p>
          <p className="mt-1 text-2xl font-bold">{admins.length}</p>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card p-5 space-y-4">
          <h3 className="font-semibold">Nuevo usuario</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Nombre *</label>
              <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Email *</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Contraseña *</label>
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Rol *</label>
              <select value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value })}
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm">
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "Guardando..." : "Crear"}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">Cancelar</button>
          </div>
        </form>
      )}

      {editing && (
        <div className="card p-5 space-y-4 border-2 border-[var(--accent)]">
          <h3 className="font-semibold">Cambiar rol: {editing.nombre}</h3>
          <select value={editRol} onChange={e => setEditRol(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm">
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <div className="flex gap-2">
            <button onClick={handleEditRol} disabled={saving}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Guardar</button>
            <button onClick={() => setEditing(null)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">Cancelar</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Cargando...</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-[var(--muted)]">
              <tr>
                <th className="table-cell text-left font-medium">Nombre</th>
                <th className="table-cell text-left font-medium">Email</th>
                <th className="table-cell text-left font-medium">Rol</th>
                <th className="table-cell text-left font-medium">Estado</th>
                <th className="table-cell text-left font-medium">Creado</th>
                <th className="table-cell text-left font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {usuarios.map(u => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="table-cell font-medium">{u.nombre}</td>
                  <td className="table-cell text-[var(--muted)]">{u.email}</td>
                  <td className="table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.rol === "ADMIN" ? "bg-purple-50 text-purple-700" : u.rol === "CONTADOR" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                      {u.rol}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {u.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="table-cell text-xs text-[var(--muted)]">{new Date(u.created_at).toLocaleDateString("es-CL")}</td>
                  <td className="table-cell">
                    <div className="flex gap-2">
                      <button onClick={() => { setEditing(u); setEditRol(u.rol); }}
                        className="text-xs text-[var(--accent)] hover:underline">Rol</button>
                      <button onClick={() => handleToggle(u.id, u.activo)}
                        className={`text-xs hover:underline ${u.activo ? "text-amber-600" : "text-emerald-600"}`}>
                        {u.activo ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {usuarios.length === 0 && <tr><td colSpan={6} className="table-cell text-center text-[var(--muted)]">Sin usuarios</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
