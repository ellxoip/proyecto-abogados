"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";

interface TipoComprobante { id: number; nombre: string; prefijo: string | null; siguiente_numero: number; }
interface Cuenta { id: number; codigo: string; nombre: string; tipo: string; }
interface Partida { cuenta_id: string; tipo: "DEBE" | "HABER"; monto: number; glosa: string; }

export default function NuevoComprobantePage() {
  const router = useRouter();
  const [tipos, setTipos] = useState<TipoComprobante[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [form, setForm] = useState({ tipo_id: "", fecha_comprobante: new Date().toISOString().slice(0, 10), descripcion: "" });
  const [partidas, setPartidas] = useState<Partida[]>([
    { cuenta_id: "", tipo: "DEBE", monto: 0, glosa: "" },
    { cuenta_id: "", tipo: "HABER", monto: 0, glosa: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/contabilidad/tipos-comprobante").then(r => r.json()).then(setTipos);
    fetch("/api/contabilidad/cuentas").then(r => r.json()).then((all: Cuenta[]) => setCuentas(all.filter(c => (c as unknown as { acepta_movimientos: boolean }).acepta_movimientos)));
  }, []);

  function addPartida(tipo: "DEBE" | "HABER") {
    setPartidas(ps => [...ps, { cuenta_id: "", tipo, monto: 0, glosa: "" }]);
  }

  function updatePartida(i: number, field: keyof Partida, value: string | number) {
    setPartidas(ps => ps.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
  }

  const totalDebe = partidas.filter(p => p.tipo === "DEBE").reduce((s, p) => s + p.monto, 0);
  const totalHaber = partidas.filter(p => p.tipo === "HABER").reduce((s, p) => s + p.monto, 0);
  const cuadra = Math.abs(totalDebe - totalHaber) < 0.01;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!cuadra) return setError(`No cuadra: Debe=${formatCurrency(totalDebe)}, Haber=${formatCurrency(totalHaber)}`);
    if (partidas.some(p => !p.cuenta_id)) return setError("Todas las partidas deben tener cuenta.");
    setSaving(true); setError("");
    const r = await fetch("/api/contabilidad/comprobantes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, tipo_id: Number(form.tipo_id), partidas: partidas.map(p => ({ ...p, cuenta_id: Number(p.cuenta_id) })) }),
    });
    if (!r.ok) { const d = await r.json(); setError(d.error || "Error"); setSaving(false); return; }
    router.push("/contabilidad/comprobantes");
  }

  return (
    <section className="space-y-6 max-w-4xl">
      <header>
        <h2 className="text-2xl font-semibold">Nuevo comprobante contable</h2>
        <p className="text-sm text-[var(--muted)]">Registrar asiento contable</p>
      </header>

      <form onSubmit={submit} className="space-y-6">
        {error && <p className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

        <div className="card p-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Tipo *</label>
              <select required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.tipo_id} onChange={e => setForm(f => ({ ...f, tipo_id: e.target.value }))}>
                <option value="">Seleccionar...</option>
                {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre} (próx. N° {t.siguiente_numero})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Fecha *</label>
              <input required type="date" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.fecha_comprobante} onChange={e => setForm(f => ({ ...f, fecha_comprobante: e.target.value }))} />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs text-[var(--muted)] mb-1">Descripción *</label>
              <input required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
            </div>
          </div>
        </div>

        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Partidas</h3>
            <div className="flex gap-2">
              <button type="button" onClick={() => addPartida("DEBE")} className="text-xs text-blue-600 hover:underline">+ Debe</button>
              <button type="button" onClick={() => addPartida("HABER")} className="text-xs text-emerald-600 hover:underline">+ Haber</button>
            </div>
          </div>

          <div className="space-y-2">
            {partidas.map((p, i) => (
              <div key={i} className={`grid gap-2 sm:grid-cols-12 items-end p-2 rounded ${p.tipo === "DEBE" ? "bg-blue-50" : "bg-emerald-50"}`}>
                <div className="sm:col-span-1 flex items-center justify-center pt-5">
                  <span className={`text-xs font-bold ${p.tipo === "DEBE" ? "text-blue-600" : "text-emerald-600"}`}>{p.tipo}</span>
                </div>
                <div className="sm:col-span-5">
                  <label className="block text-xs text-[var(--muted)] mb-1">Cuenta *</label>
                  <select required className="w-full rounded border border-[var(--border)] px-2 py-1.5 text-sm" value={p.cuenta_id} onChange={e => updatePartida(i, "cuenta_id", e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {cuentas.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs text-[var(--muted)] mb-1">Glosa</label>
                  <input className="w-full rounded border border-[var(--border)] px-2 py-1.5 text-sm" value={p.glosa} onChange={e => updatePartida(i, "glosa", e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-[var(--muted)] mb-1">Monto *</label>
                  <input required type="number" min="0" step="1" className="w-full rounded border border-[var(--border)] px-2 py-1.5 text-sm" value={p.monto} onChange={e => updatePartida(i, "monto", Number(e.target.value))} />
                </div>
                <div className="sm:col-span-1 flex items-end pb-1">
                  {partidas.length > 2 && (
                    <button type="button" onClick={() => setPartidas(ps => ps.filter((_, idx) => idx !== i))} className="text-rose-400 hover:text-rose-600 text-sm">✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className={`flex gap-6 justify-end text-sm p-3 rounded ${cuadra ? "bg-emerald-50" : "bg-rose-50"}`}>
            <span>Debe: <strong>{formatCurrency(totalDebe)}</strong></span>
            <span>Haber: <strong>{formatCurrency(totalHaber)}</strong></span>
            <span className={`font-semibold ${cuadra ? "text-emerald-600" : "text-rose-600"}`}>
              {cuadra ? "✓ Cuadra" : `Diferencia: ${formatCurrency(Math.abs(totalDebe - totalHaber))}`}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <button type="submit" disabled={saving || !cuadra} className="rounded-md bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {saving ? "Guardando..." : "Guardar comprobante"}
          </button>
          <button type="button" onClick={() => router.back()} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50">Cancelar</button>
        </div>
      </form>
    </section>
  );
}
