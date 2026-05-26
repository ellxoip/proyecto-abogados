"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";

type Egreso = {
  id: number;
  categoria: string;
  descripcion: string;
  monto: string;
  fecha_egreso: string;
  fecha_vencimiento: string | null;
  estado: "PENDIENTE" | "APROBADO" | "PAGADO" | "RECHAZADO";
  referencia: string | null;
  recurrente: boolean;
  cuenta: { nombre: string; banco: { nombre: string } };
  proveedor: { id: number; nombre: string; rut: string } | null;
};

type Cuenta = { id: number; nombre: string; banco: { nombre: string } };

const ESTADO_CLASS: Record<string, string> = {
  PENDIENTE: "bg-amber-100 text-amber-700",
  APROBADO: "bg-sky-100 text-sky-700",
  PAGADO: "bg-emerald-100 text-emerald-700",
  RECHAZADO: "bg-rose-100 text-rose-700",
};

export default function EgresosPage() {
  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [form, setForm] = useState({ cuenta_id: "", categoria: "", descripcion: "", monto: "", fecha_egreso: new Date().toISOString().slice(0, 10), fecha_vencimiento: "", recurrente: false });
  const [saving, setSaving] = useState(false);

  async function load() {
    const params = new URLSearchParams();
    if (filtroEstado) params.set("estado", filtroEstado);
    const [re, rc] = await Promise.all([
      fetch(`/api/tesoreria/egresos?${params}`).then((r) => r.json()),
      fetch("/api/tesoreria/cuentas").then((r) => r.json()),
    ]);
    setEgresos(re);
    setCuentas(rc);
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/tesoreria/egresos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, cuenta_id: Number(form.cuenta_id), monto: Number(form.monto), fecha_vencimiento: form.fecha_vencimiento || undefined }),
    });
    setShowForm(false);
    setSaving(false);
    load();
  }

  async function cambiarEstado(id: number, estado: string) {
    await fetch(`/api/tesoreria/egresos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    });
    load();
  }

  const hoy = new Date();
  const vencidos = egresos.filter((e) => e.estado === "PENDIENTE" && e.fecha_vencimiento && new Date(e.fecha_vencimiento) < hoy);

  if (loading) return <div className="text-sm text-[var(--muted)]">Cargando...</div>;

  return (
    <section className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Egresos</h2>
          <p className="text-sm text-[var(--muted)]">Salidas de dinero y pagos programados</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          + Registrar egreso
        </button>
      </header>

      {vencidos.length > 0 && (
        <div className="card border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {vencidos.length} egreso{vencidos.length !== 1 ? "s" : ""} vencido{vencidos.length !== 1 ? "s" : ""} sin pagar
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        {["PENDIENTE", "APROBADO", "PAGADO"].map((est) => (
          <div key={est} className="card p-4">
            <p className="text-xs text-[var(--muted)]">{est}</p>
            <p className="mt-1 text-xl font-bold">
              {formatCurrency(egresos.filter((e) => e.estado === est).reduce((s, e) => s + Number(e.monto), 0))}
            </p>
            <p className="text-xs text-[var(--muted)]">{egresos.filter((e) => e.estado === est).length} egresos</p>
          </div>
        ))}
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Vencidos</p>
          <p className={`mt-1 text-xl font-bold ${vencidos.length > 0 ? "text-rose-600" : ""}`}>{vencidos.length}</p>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card p-5 space-y-4">
          <h3 className="font-semibold">Nuevo egreso</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Cuenta débito *</label>
              <select value={form.cuenta_id} onChange={(e) => setForm({ ...form, cuenta_id: e.target.value })} required className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm">
                <option value="">Seleccionar...</option>
                {cuentas.map((c) => <option key={c.id} value={c.id}>{c.banco.nombre} — {c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Categoría *</label>
              <input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} required placeholder="Arriendo, Sueldo, Servicios..." className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Monto *</label>
              <input type="number" step="0.01" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} required className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Descripción *</label>
              <input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} required placeholder="Descripción del gasto" className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Fecha egreso *</label>
              <input type="date" value={form.fecha_egreso} onChange={(e) => setForm({ ...form, fecha_egreso: e.target.value })} required className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Fecha vencimiento</label>
              <input type="date" value={form.fecha_vencimiento} onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })} className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.recurrente} onChange={(e) => setForm({ ...form, recurrente: e.target.checked })} />
                Recurrente
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "Guardando..." : "Registrar"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">Cancelar</button>
          </div>
        </form>
      )}

      <div className="flex gap-2">
        {["", "PENDIENTE", "APROBADO", "PAGADO", "RECHAZADO"].map((est) => (
          <button key={est} onClick={() => { setFiltroEstado(est); setTimeout(load, 50); }}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${filtroEstado === est ? "bg-[var(--accent)] text-white" : "border border-[var(--border)]"}`}>
            {est || "Todos"}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--muted)]">
            <tr>
              <th className="table-cell font-medium">Fecha</th>
              <th className="table-cell font-medium">Categoría</th>
              <th className="table-cell font-medium">Descripción</th>
              <th className="table-cell font-medium">Cuenta</th>
              <th className="table-cell font-medium">Vencimiento</th>
              <th className="table-cell font-medium">Estado</th>
              <th className="table-cell font-medium text-right">Monto</th>
              <th className="table-cell font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {egresos.map((e) => {
              const vencido = e.estado === "PENDIENTE" && e.fecha_vencimiento && new Date(e.fecha_vencimiento) < hoy;
              return (
                <tr key={e.id} className={vencido ? "bg-rose-50" : "hover:bg-slate-50"}>
                  <td className="table-cell">{new Date(e.fecha_egreso).toLocaleDateString("es-CL")}</td>
                  <td className="table-cell">{e.categoria}</td>
                  <td className="table-cell">{e.descripcion}</td>
                  <td className="table-cell text-xs text-[var(--muted)]">{e.cuenta.banco.nombre}</td>
                  <td className="table-cell text-xs">
                    {e.fecha_vencimiento ? (
                      <span className={vencido ? "font-medium text-rose-600" : ""}>{new Date(e.fecha_vencimiento).toLocaleDateString("es-CL")}</span>
                    ) : "—"}
                  </td>
                  <td className="table-cell">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_CLASS[e.estado]}`}>{e.estado}</span>
                  </td>
                  <td className="table-cell text-right font-semibold">{formatCurrency(Number(e.monto))}</td>
                  <td className="table-cell">
                    {e.estado === "PENDIENTE" && (
                      <div className="flex gap-1">
                        <button onClick={() => cambiarEstado(e.id, "APROBADO")} className="rounded border border-sky-300 px-2 py-0.5 text-xs text-sky-700">Aprobar</button>
                        <button onClick={() => cambiarEstado(e.id, "PAGADO")} className="rounded border border-emerald-300 px-2 py-0.5 text-xs text-emerald-700">Pagar</button>
                      </div>
                    )}
                    {e.estado === "APROBADO" && (
                      <button onClick={() => cambiarEstado(e.id, "PAGADO")} className="rounded border border-emerald-300 px-2 py-0.5 text-xs text-emerald-700">Marcar pagado</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {egresos.length === 0 && (
              <tr><td colSpan={8} className="table-cell text-center text-[var(--muted)]">Sin egresos</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
