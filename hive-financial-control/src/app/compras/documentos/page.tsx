"use client";
import { useEffect, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";

interface Proveedor { id: number; nombre: string; }
interface DocumentoCompra {
  id: number; tipo: string; numero: string | null; fecha_emision: string;
  monto_neto: string; iva: string; monto_total: string; estado: string;
  proveedor: { nombre: string; rut: string | null };
}

export default function DocumentosCompraPage() {
  const [docs, setDocs] = useState<DocumentoCompra[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ proveedor_id: "", tipo: "FACTURA", numero: "", fecha_emision: new Date().toISOString().slice(0, 10), fecha_vencimiento: "", monto_neto: "", con_iva: true });
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await fetch("/api/compras/documentos");
    setDocs(await r.json());
  }
  useEffect(() => {
    fetch("/api/compras/documentos").then(r => r.json()).then(setDocs);
    fetch("/api/compras/proveedores").then(r => r.json()).then(setProveedores);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/compras/documentos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, proveedor_id: Number(form.proveedor_id), monto_neto: Number(form.monto_neto) }) });
    setSaving(false); setShowForm(false);
    setForm({ proveedor_id: "", tipo: "FACTURA", numero: "", fecha_emision: new Date().toISOString().slice(0, 10), fecha_vencimiento: "", monto_neto: "", con_iva: true });
    load();
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Documentos de compra</h2>
          <p className="text-sm text-[var(--muted)]">Facturas y liquidaciones de proveedores</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">Ingresar documento</button>
      </header>

      {showForm && (
        <form onSubmit={submit} className="card p-5 space-y-4">
          <h3 className="font-semibold">Ingresar documento de compra</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Proveedor *</label>
              <select required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.proveedor_id} onChange={e => setForm(f => ({ ...f, proveedor_id: e.target.value }))}>
                <option value="">Seleccionar...</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Tipo *</label>
              <select required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                <option value="FACTURA">Factura</option>
                <option value="FACTURA_ELECTRONICA">Factura electrónica</option>
                <option value="LIQUIDACION">Liquidación</option>
                <option value="BOLETA">Boleta</option>
                <option value="NOTA_CREDITO">Nota de crédito</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">N° documento</label>
              <input className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Fecha emisión *</label>
              <input required type="date" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.fecha_emision} onChange={e => setForm(f => ({ ...f, fecha_emision: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Monto neto *</label>
              <input required type="number" min="0" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.monto_neto} onChange={e => setForm(f => ({ ...f, monto_neto: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Vencimiento</label>
              <input type="date" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.fecha_vencimiento} onChange={e => setForm(f => ({ ...f, fecha_vencimiento: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="con_iva_doc" checked={form.con_iva} onChange={e => setForm(f => ({ ...f, con_iva: e.target.checked }))} />
              <label htmlFor="con_iva_doc" className="text-sm">Con IVA (19%)</label>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">{saving ? "Guardando..." : "Ingresar"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50">Cancelar</button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Tipo</th>
              <th className="table-cell text-left font-medium">N°</th>
              <th className="table-cell text-left font-medium">Proveedor</th>
              <th className="table-cell text-left font-medium">Fecha</th>
              <th className="table-cell text-left font-medium">Estado</th>
              <th className="table-cell text-right font-medium">Neto</th>
              <th className="table-cell text-right font-medium">IVA</th>
              <th className="table-cell text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {docs.map(d => (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="table-cell">{d.tipo}</td>
                <td className="table-cell text-[var(--muted)]">{d.numero ?? "—"}</td>
                <td className="table-cell">{d.proveedor.nombre}</td>
                <td className="table-cell">{formatDate(d.fecha_emision)}</td>
                <td className="table-cell">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${d.estado === "ACEPTADO" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>{d.estado}</span>
                </td>
                <td className="table-cell text-right">{formatCurrency(Number(d.monto_neto))}</td>
                <td className="table-cell text-right">{formatCurrency(Number(d.iva))}</td>
                <td className="table-cell text-right font-semibold">{formatCurrency(Number(d.monto_total))}</td>
              </tr>
            ))}
            {docs.length === 0 && <tr><td colSpan={8} className="table-cell text-center text-[var(--muted)]">Sin documentos.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
