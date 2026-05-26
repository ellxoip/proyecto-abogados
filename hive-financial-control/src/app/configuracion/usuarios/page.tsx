"use client";
import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";

interface Usuario {
  id: number; nombre: string; email: string; rol: string; activo: boolean; created_at: string;
}

const ROLES = ["ADMIN", "CONTADOR", "ABOGADO", "ANALISTA", "SOLO_LECTURA"];

export default function UsuariosConfigPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [resetting, setResetting] = useState<number | null>(null);
  const [resetPwd, setResetPwd] = useState("");
  const [form, setForm] = useState({ nombre: "", email: "", password: "", rol: "CONTADOR" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const r = await fetch("/api/usuarios");
    setUsuarios(await r.json());
  }
  useEffect(() => { fetch("/api/usuarios").then(r => r.json()).then(setUsuarios); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    const r = await fetch("/api/usuarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (!r.ok) { const d = await r.json(); setError(d.error || "Error"); setSaving(false); return; }
    setSaving(false); setShowForm(false);
    setForm({ nombre: "", email: "", password: "", rol: "CONTADOR" });
    load();
  }

  async function toggleActivo(id: number, activo: boolean) {
    await fetch(`/api/usuarios/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activo: !activo }) });
    load();
  }

  async function resetPassword(id: number) {
    if (!resetPwd || resetPwd.length < 6) return;
    await fetch(`/api/usuarios/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: resetPwd }) });
    setResetting(null); setResetPwd("");
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Usuarios</h2>
          <p className="text-sm text-[var(--muted)]">Gestión de usuarios y roles del sistema</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">Nuevo usuario</button>
      </header>

      {showForm && (
        <form onSubmit={submit} className="card p-5 space-y-4">
          <h3 className="font-semibold">Nuevo usuario</h3>
          {error && <p className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Nombre *</label>
              <input required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Email *</label>
              <input required type="email" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Contraseña *</label>
              <input required type="password" minLength={6} className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Rol *</label>
              <select required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">{saving ? "Creando..." : "Crear usuario"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50">Cancelar</button>
          </div>
        </form>
      )}

      {resetting !== null && (
        <div className="card p-4 flex gap-3 items-center">
          <p className="text-sm">Nueva contraseña:</p>
          <input type="password" minLength={6} placeholder="Mínimo 6 caracteres" className="flex-1 rounded border border-[var(--border)] px-3 py-2 text-sm" value={resetPwd} onChange={e => setResetPwd(e.target.value)} />
          <button onClick={() => resetPassword(resetting)} className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">Guardar</button>
          <button onClick={() => { setResetting(null); setResetPwd(""); }} className="text-sm text-[var(--muted)] hover:text-slate-700">Cancelar</button>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Nombre</th>
              <th className="table-cell text-left font-medium">Email</th>
              <th className="table-cell text-left font-medium">Rol</th>
              <th className="table-cell text-left font-medium">Creado</th>
              <th className="table-cell text-center font-medium">Estado</th>
              <th className="table-cell text-center font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {usuarios.map(u => (
              <tr key={u.id} className={`hover:bg-slate-50 ${!u.activo ? "opacity-50" : ""}`}>
                <td className="table-cell font-medium">{u.nombre}</td>
                <td className="table-cell">{u.email}</td>
                <td className="table-cell">
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">{u.rol}</span>
                </td>
                <td className="table-cell text-[var(--muted)]">{formatDate(u.created_at)}</td>
                <td className="table-cell text-center">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${u.activo ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {u.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="table-cell text-center">
                  <div className="flex gap-2 justify-center">
                    <button onClick={() => setResetting(u.id)} className="text-xs text-[var(--accent)] hover:underline">Cambiar clave</button>
                    <button onClick={() => toggleActivo(u.id, u.activo)} className="text-xs text-[var(--muted)] hover:text-slate-700">
                      {u.activo ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
