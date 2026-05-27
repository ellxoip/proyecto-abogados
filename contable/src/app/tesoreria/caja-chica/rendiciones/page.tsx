"use client";
import { useEffect, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";

interface Fondo { id: number; nombre: string; }
interface Gasto { id: number; descripcion: string; monto: string; fecha_gasto: string; }
interface Rendicion {
  id: number; periodo: string; total_gastos: string; estado: string;
  observaciones: string | null; created_at: string;
  fondo: { id: number; nombre: string };
  aprobador: { nombre: string } | null;
  gastos: Gasto[];
  reposicion: unknown | null;
}

const ESTADO_LABEL: Record<string, string> = {
  BORRADOR: "Borrador", ENVIADA: "Enviada", APROBADA: "Aprobada", RECHAZADA: "Rechazada",
};
const ESTADO_COLOR: Record<string, string> = {
  BORRADOR: "bg-slate-100 text-slate-600",
  ENVIADA: "bg-blue-100 text-blue-700",
  APROBADA: "bg-emerald-100 text-emerald-700",
  RECHAZADA: "bg-rose-100 text-rose-600",
};

export default function RendicionesPage() {
  const [rendiciones, setRendiciones] = useState<Rendicion[]>([]);
  const [fondos, setFondos] = useState<Fondo[]>([]);
  const [gastosDisponibles, setGastosDisponibles] = useState<Gasto[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Rendicion | null>(null);
  const [form, setForm] = useState({ fondo_id: "", periodo: "", gastos_ids: [] as number[] });
  const [obsForm, setObsForm] = useState({ observaciones: "", estado: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await fetch("/api/tesoreria/caja-chica/rendiciones");
    setRendiciones(await r.json());
  }
  async function loadGastos(fondo_id: string) {
    if (!fondo_id) return setGastosDisponibles([]);
    const r = await fetch(`/api/tesoreria/caja-chica/gastos?fondo_id=${fondo_id}&sin_rendicion=true`);
    setGastosDisponibles(await r.json());
  }
  useEffect(() => {
    fetch("/api/tesoreria/caja-chica/rendiciones").then(r => r.json()).then(setRendiciones);
    fetch("/api/tesoreria/caja-chica/fondos").then(r => r.json()).then(setFondos);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/tesoreria/caja-chica/rendiciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, fondo_id: Number(form.fondo_id) }),
    });
    setSaving(false);
    setShowForm(false);
    setForm({ fondo_id: "", periodo: "", gastos_ids: [] });
    load();
  }

  async function cambiarEstado(id: number, estado: string, observaciones?: string) {
    await fetch(`/api/tesoreria/caja-chica/rendiciones/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado, observaciones }),
    });
    setSelected(null);
    load();
  }

  function toggleGasto(id: number) {
    setForm(f => ({
      ...f,
      gastos_ids: f.gastos_ids.includes(id) ? f.gastos_ids.filter(x => x !== id) : [...f.gastos_ids, id],
    }));
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Rendiciones de caja chica</h2>
          <p className="text-sm text-[var(--muted)]">Cerrar período y enviar para aprobación</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Nueva rendición
        </button>
      </header>

      {showForm && (
        <form onSubmit={submit} className="card p-5 space-y-4">
          <h3 className="font-semibold">Nueva rendición</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Fondo *</label>
              <select required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.fondo_id}
                onChange={e => { setForm(f => ({ ...f, fondo_id: e.target.value, gastos_ids: [] })); loadGastos(e.target.value); }}>
                <option value="">Seleccionar...</option>
                {fondos.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Período *</label>
              <input required placeholder="Ej: Mayo 2026" className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.periodo} onChange={e => setForm(f => ({ ...f, periodo: e.target.value }))} />
            </div>
          </div>
          {gastosDisponibles.length > 0 && (
            <div>
              <label className="block text-xs text-[var(--muted)] mb-2">Gastos a incluir</label>
              <div className="space-y-1 max-h-48 overflow-y-auto border border-[var(--border)] rounded p-3">
                {gastosDisponibles.map(g => (
                  <label key={g.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 px-2 py-1 rounded">
                    <input type="checkbox" checked={form.gastos_ids.includes(g.id)} onChange={() => toggleGasto(g.id)} />
                    <span className="flex-1">{g.descripcion}</span>
                    <span className="text-[var(--muted)] text-xs">{formatDate(g.fecha_gasto)}</span>
                    <span className="font-medium">{formatCurrency(Number(g.monto))}</span>
                  </label>
                ))}
              </div>
              {form.gastos_ids.length > 0 && (
                <p className="text-xs text-[var(--muted)] mt-1">
                  {form.gastos_ids.length} gasto(s) seleccionado(s) —
                  Total: {formatCurrency(gastosDisponibles.filter(g => form.gastos_ids.includes(g.id)).reduce((s, g) => s + Number(g.monto), 0))}
                </p>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {saving ? "Creando..." : "Crear rendición"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {selected && (
        <div className="card p-5 space-y-4 border-l-4 border-[var(--accent)]">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Rendición #{selected.id} — {selected.periodo}</h3>
            <button onClick={() => setSelected(null)} className="text-xs text-[var(--muted)] hover:text-slate-700">Cerrar</button>
          </div>
          <p className="text-sm">Fondo: {selected.fondo.nombre} | Total: <strong>{formatCurrency(Number(selected.total_gastos))}</strong></p>
          <div>
            <label className="block text-xs text-[var(--muted)] mb-1">Observaciones</label>
            <textarea className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" rows={2} value={obsForm.observaciones} onChange={e => setObsForm(f => ({ ...f, observaciones: e.target.value }))} />
          </div>
          <div className="flex gap-2 flex-wrap">
            {selected.estado === "BORRADOR" && (
              <button onClick={() => cambiarEstado(selected.id, "ENVIADA")} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs text-white hover:opacity-90">Enviar para aprobación</button>
            )}
            {selected.estado === "ENVIADA" && (
              <>
                <button onClick={() => cambiarEstado(selected.id, "APROBADA", obsForm.observaciones)} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs text-white hover:opacity-90">Aprobar</button>
                <button onClick={() => cambiarEstado(selected.id, "RECHAZADA", obsForm.observaciones)} className="rounded-md bg-rose-600 px-3 py-1.5 text-xs text-white hover:opacity-90">Rechazar</button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">#</th>
              <th className="table-cell text-left font-medium">Período</th>
              <th className="table-cell text-left font-medium">Fondo</th>
              <th className="table-cell text-left font-medium">Estado</th>
              <th className="table-cell text-left font-medium">Aprobador</th>
              <th className="table-cell text-right font-medium">Total</th>
              <th className="table-cell text-center font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rendiciones.map(r => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="table-cell text-[var(--muted)]">{r.id}</td>
                <td className="table-cell font-medium">{r.periodo}</td>
                <td className="table-cell">{r.fondo.nombre}</td>
                <td className="table-cell">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_COLOR[r.estado] ?? ""}`}>{ESTADO_LABEL[r.estado] ?? r.estado}</span>
                </td>
                <td className="table-cell">{r.aprobador?.nombre ?? <span className="text-[var(--muted)]">—</span>}</td>
                <td className="table-cell text-right font-medium">{formatCurrency(Number(r.total_gastos))}</td>
                <td className="table-cell text-center">
                  {(r.estado === "BORRADOR" || r.estado === "ENVIADA") && (
                    <button onClick={() => { setSelected(r); setObsForm({ observaciones: r.observaciones ?? "", estado: r.estado }); }} className="text-xs text-[var(--accent)] hover:underline">Gestionar</button>
                  )}
                </td>
              </tr>
            ))}
            {rendiciones.length === 0 && (
              <tr><td colSpan={7} className="table-cell text-center text-[var(--muted)]">Sin rendiciones.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
