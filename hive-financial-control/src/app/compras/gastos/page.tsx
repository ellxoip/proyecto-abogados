"use client";
import { useEffect, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";

interface Proveedor { id: number; nombre: string; }
interface Gasto {
  id: number; categoria: string; descripcion: string; monto_neto: string;
  iva: string; monto_total: string; fecha_gasto: string; estado_pago: string;
  aprobado: boolean; proveedor: { nombre: string } | null;
}

const CATEGORIAS = ["Honorarios", "Arriendos", "Servicios básicos", "Tecnología", "Marketing", "Capacitación", "Transporte", "Alimentación", "Útiles", "Otros"];

export default function GastosCompraPage() {
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [form, setForm] = useState({ proveedor_id: "", categoria: "", descripcion: "", monto_neto: "", con_iva: true, fecha_gasto: new Date().toISOString().slice(0, 10) });
  const [saving, setSaving] = useState(false);

  async function load() {
    const p = new URLSearchParams();
    if (estadoFiltro) p.set("estado_pago", estadoFiltro);
    const r = await fetch("/api/compras/gastos?" + p);
    setGastos(await r.json());
  }
  useEffect(() => { fetch("/api/compras/proveedores").then(r => r.json()).then(setProveedores); }, []);
  useEffect(() => {
    const p = new URLSearchParams();
    if (estadoFiltro) p.set("estado_pago", estadoFiltro);
    fetch("/api/compras/gastos?" + p).then(r => r.json()).then(setGastos);
  }, [estadoFiltro]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/compras/gastos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, monto_neto: Number(form.monto_neto), proveedor_id: form.proveedor_id ? Number(form.proveedor_id) : null }) });
    setSaving(false); setShowForm(false);
    setForm({ proveedor_id: "", categoria: "", descripcion: "", monto_neto: "", con_iva: true, fecha_gasto: new Date().toISOString().slice(0, 10) });
    load();
  }

  async function marcarPagado(id: number) {
    await fetch(`/api/compras/gastos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado_pago: "PAGADO" }) });
    load();
  }

  const total = gastos.reduce((s, g) => s + Number(g.monto_total), 0);

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Gastos</h2>
          <p className="text-sm text-[var(--muted)]">Registro de gastos y facturas de compra</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">Registrar gasto</button>
      </header>

      {showForm && (
        <form onSubmit={submit} className="card p-5 space-y-4">
          <h3 className="font-semibold">Nuevo gasto</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Proveedor</label>
              <select className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.proveedor_id} onChange={e => setForm(f => ({ ...f, proveedor_id: e.target.value }))}>
                <option value="">Sin proveedor</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Categoría *</label>
              <select required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                <option value="">Seleccionar...</option>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-[var(--muted)] mb-1">Descripción *</label>
              <input required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Monto neto *</label>
              <input required type="number" min="0" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.monto_neto} onChange={e => setForm(f => ({ ...f, monto_neto: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Fecha *</label>
              <input required type="date" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.fecha_gasto} onChange={e => setForm(f => ({ ...f, fecha_gasto: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="con_iva_g" checked={form.con_iva} onChange={e => setForm(f => ({ ...f, con_iva: e.target.checked }))} />
              <label htmlFor="con_iva_g" className="text-sm">Con IVA (19%)</label>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">{saving ? "Guardando..." : "Registrar"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50">Cancelar</button>
          </div>
        </form>
      )}

      <div className="flex gap-3 items-center">
        <select className="rounded border border-[var(--border)] px-3 py-2 text-sm" value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="PENDIENTE">Pendiente</option>
          <option value="PAGADO">Pagado</option>
          <option value="ANULADO">Anulado</option>
        </select>
        <span className="ml-auto text-sm text-[var(--muted)]">Total: <strong>{formatCurrency(total)}</strong></span>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Fecha</th>
              <th className="table-cell text-left font-medium">Proveedor</th>
              <th className="table-cell text-left font-medium">Categoría</th>
              <th className="table-cell text-left font-medium">Descripción</th>
              <th className="table-cell text-right font-medium">Neto</th>
              <th className="table-cell text-right font-medium">IVA</th>
              <th className="table-cell text-right font-medium">Total</th>
              <th className="table-cell text-center font-medium">Estado</th>
              <th className="table-cell text-center font-medium">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {gastos.map(g => (
              <tr key={g.id} className="hover:bg-slate-50">
                <td className="table-cell">{formatDate(g.fecha_gasto)}</td>
                <td className="table-cell">{g.proveedor?.nombre ?? <span className="text-[var(--muted)]">—</span>}</td>
                <td className="table-cell">{g.categoria}</td>
                <td className="table-cell">{g.descripcion}</td>
                <td className="table-cell text-right">{formatCurrency(Number(g.monto_neto))}</td>
                <td className="table-cell text-right">{formatCurrency(Number(g.iva))}</td>
                <td className="table-cell text-right font-medium">{formatCurrency(Number(g.monto_total))}</td>
                <td className="table-cell text-center">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${g.estado_pago === "PAGADO" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{g.estado_pago}</span>
                </td>
                <td className="table-cell text-center">
                  {g.estado_pago === "PENDIENTE" && (
                    <button onClick={() => marcarPagado(g.id)} className="text-xs text-emerald-600 hover:underline">Pagar</button>
                  )}
                </td>
              </tr>
            ))}
            {gastos.length === 0 && (
              <tr><td colSpan={9} className="table-cell text-center text-[var(--muted)]">Sin gastos.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
