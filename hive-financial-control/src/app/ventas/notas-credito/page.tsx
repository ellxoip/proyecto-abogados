"use client";
import { useEffect, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";

interface NotaCredito {
  id: number; numero: number | null; monto: string; motivo: string;
  fecha_emision: string; estado: string;
  documento_origen: { id: number; tipo: string; razon_social: string; monto_total: string };
}
interface DocumentoVenta { id: number; tipo: string; razon_social: string; monto_total: string; }

export default function NotasCreditoPage() {
  const [notas, setNotas] = useState<NotaCredito[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoVenta[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ documento_origen_id: "", monto: "", motivo: "", fecha_emision: new Date().toISOString().slice(0, 10) });
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await fetch("/api/ventas/notas-credito");
    setNotas(await r.json());
  }
  useEffect(() => {
    fetch("/api/ventas/notas-credito").then(r => r.json()).then(setNotas);
    fetch("/api/ventas/documentos?estado=EMITIDO").then(r => r.json()).then(setDocumentos);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/ventas/notas-credito", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, documento_origen_id: Number(form.documento_origen_id), monto: Number(form.monto) }),
    });
    setSaving(false); setShowForm(false);
    setForm({ documento_origen_id: "", monto: "", motivo: "", fecha_emision: new Date().toISOString().slice(0, 10) });
    load();
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Notas de crédito</h2>
          <p className="text-sm text-[var(--muted)]">Anulaciones parciales o totales de documentos</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Nueva nota de crédito
        </button>
      </header>

      {showForm && (
        <form onSubmit={submit} className="card p-5 space-y-4">
          <h3 className="font-semibold">Nueva nota de crédito</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs text-[var(--muted)] mb-1">Documento origen *</label>
              <select required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.documento_origen_id} onChange={e => setForm(f => ({ ...f, documento_origen_id: e.target.value }))}>
                <option value="">Seleccionar...</option>
                {documentos.map(d => <option key={d.id} value={d.id}>#{d.id} — {d.tipo} {d.razon_social} ({formatCurrency(Number(d.monto_total))})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Monto nota crédito *</label>
              <input required type="number" min="1" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Fecha emisión *</label>
              <input required type="date" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.fecha_emision} onChange={e => setForm(f => ({ ...f, fecha_emision: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-[var(--muted)] mb-1">Motivo *</label>
              <input required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {saving ? "Emitiendo..." : "Emitir nota de crédito"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50">Cancelar</button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">#</th>
              <th className="table-cell text-left font-medium">Documento origen</th>
              <th className="table-cell text-left font-medium">Receptor</th>
              <th className="table-cell text-left font-medium">Fecha</th>
              <th className="table-cell text-left font-medium">Motivo</th>
              <th className="table-cell text-right font-medium">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {notas.map(n => (
              <tr key={n.id} className="hover:bg-slate-50">
                <td className="table-cell text-[var(--muted)]">{n.numero ?? n.id}</td>
                <td className="table-cell">{n.documento_origen.tipo} #{n.documento_origen.id}</td>
                <td className="table-cell">{n.documento_origen.razon_social}</td>
                <td className="table-cell">{formatDate(n.fecha_emision)}</td>
                <td className="table-cell">{n.motivo}</td>
                <td className="table-cell text-right font-semibold text-rose-600">-{formatCurrency(Number(n.monto))}</td>
              </tr>
            ))}
            {notas.length === 0 && (
              <tr><td colSpan={6} className="table-cell text-center text-[var(--muted)]">Sin notas de crédito.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
