"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type TipoDoc = {
  id: number;
  nombre: string;
  codigo: string;
  folio_inicial: number;
  siguiente_folio: number;
  cuenta_contable: string | null;
  activo: boolean;
};

export default function TiposDocumentosPage() {
  const [tipos, setTipos] = useState<TipoDoc[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nombre: "", codigo: "", folio_inicial: 1, cuenta_contable: "" });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<TipoDoc | null>(null);
  const [editForm, setEditForm] = useState({ siguiente_folio: 1, activo: true });

  async function load() {
    const r = await fetch("/api/configuracion/tipos-documentos");
    setTipos(await r.json());
  }

  useEffect(() => { fetch("/api/configuracion/tipos-documentos").then(r => r.json()).then(setTipos); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/configuracion/tipos-documentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ nombre: "", codigo: "", folio_inicial: 1, cuenta_contable: "" });
    setShowForm(false);
    setSaving(false);
    load();
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    await fetch(`/api/configuracion/tipos-documentos/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setEditing(null);
    setSaving(false);
    load();
  }

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/configuracion" className="text-xs text-[var(--muted)] hover:underline">← Configuración</Link>
          <h2 className="mt-1 text-2xl font-semibold">Tipos de documentos</h2>
          <p className="text-sm text-[var(--muted)]">Clasificación y numeración de documentos tributarios</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">
          + Crear tipo
        </button>
      </header>

      {showForm && (
        <form onSubmit={handleCreate} className="card p-5 space-y-4">
          <h3 className="font-semibold">Nuevo tipo de documento</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Nombre *</label>
              <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required
                placeholder="Boleta electrónica" className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Código SII *</label>
              <input value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} required
                placeholder="39, 33, 61..." className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Folio inicial</label>
              <input type="number" value={form.folio_inicial} onChange={e => setForm({ ...form, folio_inicial: Number(e.target.value) })}
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Cuenta contable</label>
              <input value={form.cuenta_contable} onChange={e => setForm({ ...form, cuenta_contable: e.target.value })}
                placeholder="1-1-01" className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "Guardando..." : "Guardar"}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">Cancelar</button>
          </div>
        </form>
      )}

      {editing && (
        <form onSubmit={handleEdit} className="card p-5 space-y-4 border-2 border-[var(--accent)]">
          <h3 className="font-semibold">Editar: {editing.nombre}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Siguiente folio</label>
              <input type="number" value={editForm.siguiente_folio}
                onChange={e => setEditForm({ ...editForm, siguiente_folio: Number(e.target.value) })}
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" id="activo-edit" checked={editForm.activo}
                onChange={e => setEditForm({ ...editForm, activo: e.target.checked })} />
              <label htmlFor="activo-edit" className="text-sm">Activo</label>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "Guardando..." : "Guardar"}
            </button>
            <button type="button" onClick={() => setEditing(null)}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">Cancelar</button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Nombre</th>
              <th className="table-cell text-left font-medium">Código</th>
              <th className="table-cell text-center font-medium">Folio inicial</th>
              <th className="table-cell text-center font-medium">Siguiente folio</th>
              <th className="table-cell text-left font-medium">Cuenta contable</th>
              <th className="table-cell text-left font-medium">Estado</th>
              <th className="table-cell text-left font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {tipos.map(t => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="table-cell font-medium">{t.nombre}</td>
                <td className="table-cell text-[var(--muted)]">{t.codigo}</td>
                <td className="table-cell text-center">{t.folio_inicial}</td>
                <td className="table-cell text-center font-semibold">{t.siguiente_folio}</td>
                <td className="table-cell text-[var(--muted)]">{t.cuenta_contable ?? "—"}</td>
                <td className="table-cell">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${t.activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {t.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="table-cell">
                  <button onClick={() => { setEditing(t); setEditForm({ siguiente_folio: t.siguiente_folio, activo: t.activo }); }}
                    className="text-xs text-[var(--accent)] hover:underline">Editar</button>
                </td>
              </tr>
            ))}
            {tipos.length === 0 && <tr><td colSpan={7} className="table-cell text-center text-[var(--muted)]">Sin tipos configurados</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
