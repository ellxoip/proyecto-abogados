"use client";
import { useEffect, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";

interface Proveedor { id: number; nombre: string; rut: string | null; }
interface Honorario {
  id: number; monto_bruto: string; tasa_retencion: string; monto_retencion: string;
  monto_neto: string; fecha_emision: string; periodo_tributario: string | null; pagado: boolean;
  proveedor: { nombre: string; rut: string | null };
}

export default function HonorariosPage() {
  const [honorarios, setHonorarios] = useState<Honorario[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [form, setForm] = useState({ proveedor_id: "", monto_bruto: "", tasa_retencion: "10.75", fecha_emision: new Date().toISOString().slice(0, 10), periodo_tributario: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    const p = new URLSearchParams();
    if (filtro) p.set("pagado", filtro);
    const r = await fetch("/api/compras/honorarios?" + p);
    setHonorarios(await r.json());
  }
  useEffect(() => { fetch("/api/compras/proveedores").then(r => r.json()).then(setProveedores); }, []);
  useEffect(() => {
    const p = new URLSearchParams();
    if (filtro) p.set("pagado", filtro);
    fetch("/api/compras/honorarios?" + p).then(r => r.json()).then(setHonorarios);
  }, [filtro]);

  const bruto = Number(form.monto_bruto) || 0;
  const tasa = Number(form.tasa_retencion) / 100;
  const retencion = Math.round(bruto * tasa);
  const neto = bruto - retencion;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/compras/honorarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, monto_bruto: bruto, tasa_retencion: tasa, proveedor_id: Number(form.proveedor_id) }) });
    setSaving(false); setShowForm(false);
    setForm({ proveedor_id: "", monto_bruto: "", tasa_retencion: "10.75", fecha_emision: new Date().toISOString().slice(0, 10), periodo_tributario: "" });
    load();
  }

  async function marcarPagado(id: number) {
    await fetch(`/api/compras/honorarios/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pagado: true }) });
    load();
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Honorarios recibidos</h2>
          <p className="text-sm text-[var(--muted)]">Boletas de honorarios con retención</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">Registrar honorario</button>
      </header>

      {showForm && (
        <form onSubmit={submit} className="card p-5 space-y-4">
          <h3 className="font-semibold">Nuevo honorario</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Prestador *</label>
              <select required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.proveedor_id} onChange={e => setForm(f => ({ ...f, proveedor_id: e.target.value }))}>
                <option value="">Seleccionar...</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre} {p.rut && `(${p.rut})`}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Fecha emisión *</label>
              <input required type="date" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.fecha_emision} onChange={e => setForm(f => ({ ...f, fecha_emision: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Monto bruto *</label>
              <input required type="number" min="0" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.monto_bruto} onChange={e => setForm(f => ({ ...f, monto_bruto: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Retención %</label>
              <input type="number" min="0" max="100" step="0.01" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.tasa_retencion} onChange={e => setForm(f => ({ ...f, tasa_retencion: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Período tributario</label>
              <input placeholder="YYYY-MM" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.periodo_tributario} onChange={e => setForm(f => ({ ...f, periodo_tributario: e.target.value }))} />
            </div>
          </div>
          {bruto > 0 && (
            <div className="rounded bg-slate-50 px-4 py-3 text-sm space-y-1">
              <p>Retención ({form.tasa_retencion}%): <strong>{formatCurrency(retencion)}</strong></p>
              <p>Monto a pagar: <strong>{formatCurrency(neto)}</strong></p>
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">{saving ? "Guardando..." : "Registrar"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50">Cancelar</button>
          </div>
        </form>
      )}

      <select className="rounded border border-[var(--border)] px-3 py-2 text-sm" value={filtro} onChange={e => setFiltro(e.target.value)}>
        <option value="">Todos</option>
        <option value="false">Pendientes de pago</option>
        <option value="true">Pagados</option>
      </select>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Prestador</th>
              <th className="table-cell text-left font-medium">Fecha</th>
              <th className="table-cell text-left font-medium">Período</th>
              <th className="table-cell text-right font-medium">Bruto</th>
              <th className="table-cell text-right font-medium">Retención</th>
              <th className="table-cell text-right font-medium">Neto</th>
              <th className="table-cell text-center font-medium">Estado</th>
              <th className="table-cell text-center font-medium">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {honorarios.map(h => (
              <tr key={h.id} className="hover:bg-slate-50">
                <td className="table-cell">
                  <p className="font-medium">{h.proveedor.nombre}</p>
                  {h.proveedor.rut && <p className="text-xs text-[var(--muted)]">{h.proveedor.rut}</p>}
                </td>
                <td className="table-cell">{formatDate(h.fecha_emision)}</td>
                <td className="table-cell">{h.periodo_tributario ?? "—"}</td>
                <td className="table-cell text-right">{formatCurrency(Number(h.monto_bruto))}</td>
                <td className="table-cell text-right text-rose-500">-{formatCurrency(Number(h.monto_retencion))}</td>
                <td className="table-cell text-right font-semibold">{formatCurrency(Number(h.monto_neto))}</td>
                <td className="table-cell text-center">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${h.pagado ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{h.pagado ? "Pagado" : "Pendiente"}</span>
                </td>
                <td className="table-cell text-center">
                  {!h.pagado && <button onClick={() => marcarPagado(h.id)} className="text-xs text-emerald-600 hover:underline">Pagar</button>}
                </td>
              </tr>
            ))}
            {honorarios.length === 0 && <tr><td colSpan={8} className="table-cell text-center text-[var(--muted)]">Sin honorarios.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
