"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";

interface Servicio { id: number; nombre: string; precio_base: string; unidad: string; afecto_iva: boolean; }
interface Cliente { id: number; nombre: string; rut: string | null; }
interface Linea { descripcion: string; cantidad: number; precio_unitario: number; descuento: number; subtotal: number; }

export default function NuevoDocumentoPage() {
  const router = useRouter();
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [form, setForm] = useState({
    tipo: "FACTURA_ELECTRONICA", cliente_id: "", razon_social: "", rut_receptor: "",
    fecha_emision: new Date().toISOString().slice(0, 10), fecha_vencimiento: "",
    afecto_iva: true, observaciones: "",
  });
  const [lineas, setLineas] = useState<Linea[]>([{ descripcion: "", cantidad: 1, precio_unitario: 0, descuento: 0, subtotal: 0 }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/ventas/servicios").then(r => r.json()).then(setServicios);
    fetch("/api/clientes").then(r => r.json()).then(setClientes);
  }, []);

  function updateLinea(i: number, field: keyof Linea, value: string | number) {
    setLineas(ls => ls.map((l, idx) => {
      if (idx !== i) return l;
      const updated = { ...l, [field]: value };
      updated.subtotal = updated.cantidad * updated.precio_unitario * (1 - updated.descuento / 100);
      return updated;
    }));
  }

  function addLinea() {
    setLineas(ls => [...ls, { descripcion: "", cantidad: 1, precio_unitario: 0, descuento: 0, subtotal: 0 }]);
  }

  function fillFromServicio(i: number, servicioId: string) {
    const s = servicios.find(s => s.id === Number(servicioId));
    if (!s) return;
    updateLinea(i, "descripcion", s.nombre);
    setLineas(ls => ls.map((l, idx) => {
      if (idx !== i) return l;
      const updated = { ...l, descripcion: s.nombre, precio_unitario: Number(s.precio_base) };
      updated.subtotal = updated.cantidad * updated.precio_unitario;
      return updated;
    }));
  }

  function selectCliente(id: string) {
    const c = clientes.find(c => c.id === Number(id));
    setForm(f => ({ ...f, cliente_id: id, razon_social: c?.nombre ?? f.razon_social, rut_receptor: c?.rut ?? f.rut_receptor }));
  }

  const monto_neto = lineas.reduce((s, l) => s + l.subtotal, 0);
  const iva = form.afecto_iva ? Math.round(monto_neto * 0.19) : 0;
  const monto_total = monto_neto + iva;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lineas.some(l => !l.descripcion)) return setError("Todas las líneas deben tener descripción.");
    setSaving(true); setError("");
    const r = await fetch("/api/ventas/documentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, cliente_id: form.cliente_id ? Number(form.cliente_id) : null, lineas }),
    });
    if (!r.ok) { const d = await r.json(); setError(d.error || "Error"); setSaving(false); return; }
    router.push("/ventas/documentos");
  }

  return (
    <section className="space-y-6 max-w-4xl">
      <header>
        <h2 className="text-2xl font-semibold">Nuevo documento de venta</h2>
        <p className="text-sm text-[var(--muted)]">Emitir factura, boleta u otro documento tributario</p>
      </header>

      <form onSubmit={submit} className="space-y-6">
        {error && <p className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-sm text-[var(--muted)] uppercase tracking-wide">Datos del documento</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Tipo *</label>
              <select required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                <option value="FACTURA_ELECTRONICA">Factura electrónica</option>
                <option value="BOLETA_ELECTRONICA">Boleta electrónica</option>
                <option value="FACTURA">Factura</option>
                <option value="BOLETA">Boleta</option>
                <option value="NOTA_DEBITO">Nota de débito</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Fecha emisión *</label>
              <input required type="date" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.fecha_emision} onChange={e => setForm(f => ({ ...f, fecha_emision: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Fecha vencimiento</label>
              <input type="date" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.fecha_vencimiento} onChange={e => setForm(f => ({ ...f, fecha_vencimiento: e.target.value }))} />
            </div>
          </div>
        </div>

        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-sm text-[var(--muted)] uppercase tracking-wide">Receptor</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Cliente (opcional)</label>
              <select className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.cliente_id} onChange={e => selectCliente(e.target.value)}>
                <option value="">Seleccionar cliente...</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Razón social *</label>
              <input required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.razon_social} onChange={e => setForm(f => ({ ...f, razon_social: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">RUT receptor</label>
              <input className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.rut_receptor} onChange={e => setForm(f => ({ ...f, rut_receptor: e.target.value }))} />
            </div>
          </div>
        </div>

        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-[var(--muted)] uppercase tracking-wide">Líneas</h3>
            <button type="button" onClick={addLinea} className="text-xs text-[var(--accent)] hover:underline">+ Agregar línea</button>
          </div>
          <div className="space-y-3">
            {lineas.map((l, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-12 items-end">
                <div className="sm:col-span-1">
                  <label className="block text-xs text-[var(--muted)] mb-1">Servicio</label>
                  <select className="w-full rounded border border-[var(--border)] px-2 py-1.5 text-xs" onChange={e => fillFromServicio(i, e.target.value)}>
                    <option value="">—</option>
                    {servicios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-4">
                  <label className="block text-xs text-[var(--muted)] mb-1">Descripción *</label>
                  <input required className="w-full rounded border border-[var(--border)] px-2 py-1.5 text-sm" value={l.descripcion} onChange={e => updateLinea(i, "descripcion", e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-[var(--muted)] mb-1">Cantidad</label>
                  <input type="number" min="0.001" step="0.001" className="w-full rounded border border-[var(--border)] px-2 py-1.5 text-sm" value={l.cantidad} onChange={e => updateLinea(i, "cantidad", Number(e.target.value))} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-[var(--muted)] mb-1">P. unitario</label>
                  <input type="number" min="0" className="w-full rounded border border-[var(--border)] px-2 py-1.5 text-sm" value={l.precio_unitario} onChange={e => updateLinea(i, "precio_unitario", Number(e.target.value))} />
                </div>
                <div className="sm:col-span-1">
                  <label className="block text-xs text-[var(--muted)] mb-1">Dscto %</label>
                  <input type="number" min="0" max="100" className="w-full rounded border border-[var(--border)] px-2 py-1.5 text-sm" value={l.descuento} onChange={e => updateLinea(i, "descuento", Number(e.target.value))} />
                </div>
                <div className="sm:col-span-1">
                  <label className="block text-xs text-[var(--muted)] mb-1">Subtotal</label>
                  <p className="text-sm font-medium pt-1.5">{formatCurrency(l.subtotal)}</p>
                </div>
                <div className="sm:col-span-1 flex items-end pb-1">
                  {lineas.length > 1 && (
                    <button type="button" onClick={() => setLineas(ls => ls.filter((_, idx) => idx !== i))} className="text-rose-400 hover:text-rose-600 text-sm">✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 pt-2 border-t border-[var(--border)]">
            <input type="checkbox" id="iva" checked={form.afecto_iva} onChange={e => setForm(f => ({ ...f, afecto_iva: e.target.checked }))} />
            <label htmlFor="iva" className="text-sm">Afecto a IVA (19%)</label>
          </div>
          <div className="text-right space-y-1 text-sm">
            <p className="text-[var(--muted)]">Neto: <span className="font-medium text-slate-700">{formatCurrency(monto_neto)}</span></p>
            {form.afecto_iva && <p className="text-[var(--muted)]">IVA (19%): <span className="font-medium text-slate-700">{formatCurrency(iva)}</span></p>}
            <p className="text-base font-bold">Total: {formatCurrency(monto_total)}</p>
          </div>
        </div>

        <div className="card p-4">
          <label className="block text-xs text-[var(--muted)] mb-1">Observaciones</label>
          <textarea className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" rows={2} value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} />
        </div>

        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="rounded-md bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {saving ? "Emitiendo..." : "Emitir documento"}
          </button>
          <button type="button" onClick={() => router.back()} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50">
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}
