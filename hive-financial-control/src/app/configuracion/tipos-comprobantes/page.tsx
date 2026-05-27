"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface TipoComprobante {
  id: number;
  nombre: string;
  descripcion: string | null;
  prefijo: string | null;
  siguiente_numero: number;
  activo: boolean;
  _count: { comprobantes: number };
}

export default function TiposComprobantesConfigPage() {
  const [tipos, setTipos] = useState<TipoComprobante[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nombre: "", descripcion: "", prefijo: "" });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<TipoComprobante | null>(null);
  const [editForm, setEditForm] = useState({ siguiente_numero: 1, activo: true, descripcion: "", prefijo: "" });

  async function load() {
    const r = await fetch("/api/contabilidad/tipos-comprobante");
    setTipos(await r.json());
  }

  useEffect(() => {
    fetch("/api/contabilidad/tipos-comprobante").then((r) => r.json()).then(setTipos);
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/contabilidad/tipos-comprobante", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ nombre: "", descripcion: "", prefijo: "" });
    setShowForm(false);
    setSaving(false);
    load();
  }

  function startEdit(t: TipoComprobante) {
    setEditing(t);
    setEditForm({
      siguiente_numero: t.siguiente_numero,
      activo: t.activo,
      descripcion: t.descripcion ?? "",
      prefijo: t.prefijo ?? "",
    });
  }

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/configuracion" className="text-xs text-[var(--muted)] hover:underline">
            ← Configuración
          </Link>
          <h2 className="mt-1 text-2xl font-semibold">Tipos de comprobantes</h2>
          <p className="text-sm text-[var(--muted)]">Configurar tipos de asientos contables y su numeración</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + Nuevo tipo
        </button>
      </header>

      {showForm && (
        <form onSubmit={handleCreate} className="card space-y-4 p-5">
          <h3 className="font-semibold">Nuevo tipo de comprobante</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Nombre *</label>
              <input
                required
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: Comprobante de Egreso"
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Prefijo</label>
              <input
                value={form.prefijo}
                onChange={(e) => setForm({ ...form, prefijo: e.target.value })}
                placeholder="Ej: CE"
                maxLength={10}
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Descripción</label>
              <input
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90"
            >
              {saving ? "Guardando..." : "Crear tipo"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {editing && (
        <div className="card space-y-4 border-2 border-[var(--accent)] p-5">
          <h3 className="font-semibold">Editar: {editing.nombre}</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Prefijo</label>
              <input
                value={editForm.prefijo}
                onChange={(e) => setEditForm({ ...editForm, prefijo: e.target.value })}
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Descripción</label>
              <input
                value={editForm.descripcion}
                onChange={(e) => setEditForm({ ...editForm, descripcion: e.target.value })}
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Siguiente número</label>
              <input
                type="number"
                value={editForm.siguiente_numero}
                onChange={(e) => setEditForm({ ...editForm, siguiente_numero: Number(e.target.value) })}
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="activo-edit"
              checked={editForm.activo}
              onChange={(e) => setEditForm({ ...editForm, activo: e.target.checked })}
            />
            <label htmlFor="activo-edit" className="text-sm">Activo</label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(null)}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Para editar tipos de comprobante usa{" "}
            <Link href="/contabilidad/tipos-comprobante" className="text-[var(--accent)] hover:underline">
              Contabilidad → Tipos comprobante
            </Link>
            .
          </p>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Nombre</th>
              <th className="table-cell text-left font-medium">Prefijo</th>
              <th className="table-cell text-left font-medium">Descripción</th>
              <th className="table-cell text-center font-medium">Siguiente N°</th>
              <th className="table-cell text-center font-medium">Comprobantes</th>
              <th className="table-cell text-left font-medium">Estado</th>
              <th className="table-cell text-left font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {tipos.map((t) => (
              <tr key={t.id} className={`hover:bg-slate-50 ${!t.activo ? "opacity-50" : ""}`}>
                <td className="table-cell font-medium">{t.nombre}</td>
                <td className="table-cell font-mono">{t.prefijo ?? "—"}</td>
                <td className="table-cell text-[var(--muted)]">{t.descripcion ?? "—"}</td>
                <td className="table-cell text-center">{t.siguiente_numero}</td>
                <td className="table-cell text-center">{t._count.comprobantes}</td>
                <td className="table-cell">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${t.activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                  >
                    {t.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="table-cell">
                  <button
                    onClick={() => startEdit(t)}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    Ver
                  </button>
                </td>
              </tr>
            ))}
            {tipos.length === 0 && (
              <tr>
                <td colSpan={7} className="table-cell text-center text-[var(--muted)]">
                  Sin tipos configurados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
