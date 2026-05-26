"use client";
import { useEffect, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";

interface Proveedor { id: number; nombre: string; }
interface CxP {
  id: number; monto: string; fecha_vencimiento: string; estado: string; fecha_pago: string | null;
  proveedor: { nombre: string; rut: string | null };
  documento: { tipo: string; numero: string | null } | null;
}

export default function CuentasPorPagarPage() {
  const [items, setItems] = useState<CxP[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [estadoFiltro, setEstadoFiltro] = useState("PENDIENTE");
  const [form, setForm] = useState({ proveedor_id: "", monto: "", fecha_vencimiento: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    const p = new URLSearchParams();
    if (estadoFiltro) p.set("estado", estadoFiltro);
    const r = await fetch("/api/compras/cuentas-por-pagar?" + p);
    setItems(await r.json());
  }
  useEffect(() => { fetch("/api/compras/proveedores").then(r => r.json()).then(setProveedores); }, []);
  useEffect(() => {
    const p = new URLSearchParams();
    if (estadoFiltro) p.set("estado", estadoFiltro);
    fetch("/api/compras/cuentas-por-pagar?" + p).then(r => r.json()).then(setItems);
  }, [estadoFiltro]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/compras/cuentas-por-pagar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, monto: Number(form.monto), proveedor_id: Number(form.proveedor_id) }) });
    setSaving(false); setShowForm(false);
    setForm({ proveedor_id: "", monto: "", fecha_vencimiento: "" });
    load();
  }

  async function marcarPagada(id: number) {
    await fetch(`/api/compras/cuentas-por-pagar/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "PAGADA" }) });
    load();
  }

  const hoy = new Date();
  const totalPendiente = items.filter(i => i.estado !== "PAGADA").reduce((s, i) => s + Number(i.monto), 0);
  const vencidas = items.filter(i => i.estado === "PENDIENTE" && new Date(i.fecha_vencimiento) < hoy);

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Cuentas por pagar</h2>
          <p className="text-sm text-[var(--muted)]">Control de obligaciones con proveedores</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">Nueva CxP</button>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Total pendiente</p>
          <p className="mt-1 text-xl font-bold text-amber-600">{formatCurrency(totalPendiente)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Vencidas</p>
          <p className="mt-1 text-xl font-bold text-rose-600">{vencidas.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-[var(--muted)]">Total vencido</p>
          <p className="mt-1 text-xl font-bold text-rose-600">{formatCurrency(vencidas.reduce((s, i) => s + Number(i.monto), 0))}</p>
        </div>
      </div>

      {vencidas.length > 0 && (
        <div className="rounded-md bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          {vencidas.length} cuenta(s) vencida(s) por {formatCurrency(vencidas.reduce((s, i) => s + Number(i.monto), 0))}
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="card p-5 space-y-4">
          <h3 className="font-semibold">Nueva cuenta por pagar</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Proveedor *</label>
              <select required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.proveedor_id} onChange={e => setForm(f => ({ ...f, proveedor_id: e.target.value }))}>
                <option value="">Seleccionar...</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Monto *</label>
              <input required type="number" min="0" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Vencimiento *</label>
              <input required type="date" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.fecha_vencimiento} onChange={e => setForm(f => ({ ...f, fecha_vencimiento: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">{saving ? "Guardando..." : "Crear"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50">Cancelar</button>
          </div>
        </form>
      )}

      <div className="flex gap-3">
        <select className="rounded border border-[var(--border)] px-3 py-2 text-sm" value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)}>
          <option value="PENDIENTE">Pendientes</option>
          <option value="VENCIDA">Vencidas</option>
          <option value="PAGADA">Pagadas</option>
          <option value="">Todas</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Proveedor</th>
              <th className="table-cell text-left font-medium">Documento</th>
              <th className="table-cell text-left font-medium">Vencimiento</th>
              <th className="table-cell text-left font-medium">Fecha pago</th>
              <th className="table-cell text-center font-medium">Estado</th>
              <th className="table-cell text-right font-medium">Monto</th>
              <th className="table-cell text-center font-medium">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {items.map(c => {
              const vencida = c.estado === "PENDIENTE" && new Date(c.fecha_vencimiento) < hoy;
              return (
                <tr key={c.id} className={`hover:bg-slate-50 ${vencida ? "bg-rose-50" : ""}`}>
                  <td className="table-cell font-medium">{c.proveedor.nombre}</td>
                  <td className="table-cell">{c.documento ? `${c.documento.tipo} ${c.documento.numero ?? ""}` : <span className="text-[var(--muted)]">—</span>}</td>
                  <td className={`table-cell ${vencida ? "text-rose-600 font-medium" : ""}`}>{formatDate(c.fecha_vencimiento)}</td>
                  <td className="table-cell">{c.fecha_pago ? formatDate(c.fecha_pago) : <span className="text-[var(--muted)]">—</span>}</td>
                  <td className="table-cell text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${c.estado === "PAGADA" ? "bg-emerald-100 text-emerald-700" : vencida ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-700"}`}>
                      {vencida ? "Vencida" : c.estado}
                    </span>
                  </td>
                  <td className="table-cell text-right font-semibold">{formatCurrency(Number(c.monto))}</td>
                  <td className="table-cell text-center">
                    {c.estado !== "PAGADA" && <button onClick={() => marcarPagada(c.id)} className="text-xs text-emerald-600 hover:underline">Pagar</button>}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan={7} className="table-cell text-center text-[var(--muted)]">Sin resultados.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
