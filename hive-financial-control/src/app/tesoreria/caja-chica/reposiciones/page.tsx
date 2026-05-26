"use client";
import { useEffect, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";

interface Rendicion { id: number; periodo: string; total_gastos: string; fondo: { nombre: string }; }
interface Reposicion {
  id: number; monto: string; estado: string; created_at: string;
  rendicion: { id: number; periodo: string; fondo: { nombre: string } };
  aprobador: { nombre: string } | null;
}

const ESTADO_LABEL: Record<string, string> = {
  PENDIENTE: "Pendiente", APROBADA: "Aprobada", PAGADA: "Pagada", RECHAZADA: "Rechazada",
};
const ESTADO_COLOR: Record<string, string> = {
  PENDIENTE: "bg-amber-100 text-amber-700",
  APROBADA: "bg-blue-100 text-blue-700",
  PAGADA: "bg-emerald-100 text-emerald-700",
  RECHAZADA: "bg-rose-100 text-rose-600",
};

export default function ReposicionesPage() {
  const [reposiciones, setReposiciones] = useState<Reposicion[]>([]);
  const [rendicionesAprobadas, setRendicionesAprobadas] = useState<Rendicion[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ rendicion_id: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const r = await fetch("/api/tesoreria/caja-chica/reposiciones");
    setReposiciones(await r.json());
  }
  async function loadRendiciones() {
    const r = await fetch("/api/tesoreria/caja-chica/rendiciones");
    const all: Rendicion[] = await r.json();
    setRendicionesAprobadas((all as unknown as Array<Rendicion & { estado: string; reposicion: unknown }>).filter(r => r.estado === "APROBADA" && !r.reposicion));
  }
  useEffect(() => {
    fetch("/api/tesoreria/caja-chica/reposiciones").then(r => r.json()).then(setReposiciones);
    fetch("/api/tesoreria/caja-chica/rendiciones")
      .then(r => r.json())
      .then((all: Array<Rendicion & { estado: string; reposicion: unknown }>) => {
        setRendicionesAprobadas(all.filter(r => r.estado === "APROBADA" && !r.reposicion));
      });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    const r = await fetch("/api/tesoreria/caja-chica/reposiciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rendicion_id: Number(form.rendicion_id) }),
    });
    if (!r.ok) { const d = await r.json(); setError(d.error || "Error"); }
    else { setShowForm(false); setForm({ rendicion_id: "" }); load(); loadRendiciones(); }
    setSaving(false);
  }

  async function cambiarEstado(id: number, estado: string) {
    await fetch(`/api/tesoreria/caja-chica/reposiciones/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    });
    load();
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Reposiciones de caja chica</h2>
          <p className="text-sm text-[var(--muted)]">Solicitar recarga de fondos tras rendición aprobada</p>
        </div>
        {rendicionesAprobadas.length > 0 && (
          <button onClick={() => setShowForm(true)} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            Nueva reposición
          </button>
        )}
      </header>

      {rendicionesAprobadas.length > 0 && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          {rendicionesAprobadas.length} rendición(es) aprobada(s) pendientes de reposición.
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="card p-5 space-y-4">
          <h3 className="font-semibold">Nueva reposición</h3>
          {error && <p className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <div>
            <label className="block text-xs text-[var(--muted)] mb-1">Rendición aprobada *</label>
            <select required className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm" value={form.rendicion_id} onChange={e => setForm(f => ({ ...f, rendicion_id: e.target.value }))}>
              <option value="">Seleccionar...</option>
              {rendicionesAprobadas.map(r => (
                <option key={r.id} value={r.id}>
                  #{r.id} — {r.fondo.nombre} / {r.periodo} — {formatCurrency(Number(r.total_gastos))}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {saving ? "Creando..." : "Solicitar reposición"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50">
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">#</th>
              <th className="table-cell text-left font-medium">Fondo</th>
              <th className="table-cell text-left font-medium">Rendición</th>
              <th className="table-cell text-left font-medium">Solicitada</th>
              <th className="table-cell text-left font-medium">Estado</th>
              <th className="table-cell text-left font-medium">Aprobador</th>
              <th className="table-cell text-right font-medium">Monto</th>
              <th className="table-cell text-center font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {reposiciones.map(r => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="table-cell text-[var(--muted)]">{r.id}</td>
                <td className="table-cell font-medium">{r.rendicion.fondo.nombre}</td>
                <td className="table-cell">{r.rendicion.periodo}</td>
                <td className="table-cell text-[var(--muted)]">{formatDate(r.created_at)}</td>
                <td className="table-cell">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_COLOR[r.estado] ?? ""}`}>{ESTADO_LABEL[r.estado] ?? r.estado}</span>
                </td>
                <td className="table-cell">{r.aprobador?.nombre ?? <span className="text-[var(--muted)]">—</span>}</td>
                <td className="table-cell text-right font-semibold">{formatCurrency(Number(r.monto))}</td>
                <td className="table-cell text-center">
                  <div className="flex gap-1 justify-center">
                    {r.estado === "PENDIENTE" && (
                      <button onClick={() => cambiarEstado(r.id, "APROBADA")} className="text-xs rounded bg-emerald-100 px-2 py-0.5 text-emerald-700 hover:bg-emerald-200">Aprobar</button>
                    )}
                    {r.estado === "APROBADA" && (
                      <button onClick={() => cambiarEstado(r.id, "PAGADA")} className="text-xs rounded bg-blue-100 px-2 py-0.5 text-blue-700 hover:bg-blue-200">Marcar pagada</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {reposiciones.length === 0 && (
              <tr><td colSpan={8} className="table-cell text-center text-[var(--muted)]">Sin reposiciones.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
