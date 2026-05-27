"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";

type CartolRow = {
  row: number;
  fecha: string;
  glosa: string;
  cargo: number | null;
  abono: number | null;
  status: "ok" | "error";
  error?: string;
};

type Cuenta = { id: number; nombre: string; banco: { nombre: string } };

export default function ImportarCartolasPage() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cuentaId, setCuentaId] = useState("");
  const [preview, setPreview] = useState<CartolRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ importados: number; errores: number } | null>(null);

  useEffect(() => {
    fetch("/api/tesoreria/cuentas").then(r => r.json()).then(setCuentas);
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !cuentaId) { alert("Seleccione una cuenta primero"); return; }
    setResult(null);
    setLoading(true);
    const formData = new FormData();
    formData.append("file", f);
    formData.append("cuenta_id", cuentaId);
    const r = await fetch("/api/admin/importaciones/cartolas/preview", { method: "POST", body: formData });
    if (r.ok) setPreview(await r.json());
    setLoading(false);
  }

  async function handleConfirm() {
    if (!preview || !cuentaId) return;
    setLoading(true);
    const rows = preview.filter(p => p.status === "ok");
    const r = await fetch("/api/admin/importaciones/cartolas/confirmar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows, cuenta_id: Number(cuentaId) }),
    });
    if (r.ok) { setResult(await r.json()); setPreview(null); }
    setLoading(false);
  }

  const okRows = preview?.filter(p => p.status === "ok") ?? [];
  const totalCargo = okRows.reduce((s, r) => s + (r.cargo ?? 0), 0);
  const totalAbono = okRows.reduce((s, r) => s + (r.abono ?? 0), 0);

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">Importar cartola bancaria</h2>
        <p className="text-sm text-[var(--muted)]">Importar movimientos del banco desde CSV/Excel</p>
      </header>

      <div className="card p-5 space-y-4">
        <p className="text-sm text-[var(--muted)]">Formato CSV esperado: <code className="bg-slate-100 px-1 rounded">fecha,glosa,cargo,abono</code> (cargo = egresos, abono = ingresos)</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Cuenta bancaria *</label>
            <select value={cuentaId} onChange={e => setCuentaId(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm">
              <option value="">Seleccionar cuenta</option>
              {cuentas.map(c => (
                <option key={c.id} value={c.id}>{c.banco.nombre} — {c.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Archivo CSV/Excel *</label>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} disabled={!cuentaId}
              className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50" />
          </div>
        </div>
      </div>

      {loading && <p className="text-sm text-[var(--muted)]">Procesando...</p>}

      {result && (
        <div className="card p-5">
          <p className="font-semibold text-emerald-600 mb-3">Importación completada</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-600">{result.importados}</p>
              <p className="text-xs text-[var(--muted)]">Movimientos importados</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-rose-600">{result.errores}</p>
              <p className="text-xs text-[var(--muted)]">Errores</p>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="space-y-4">
          <div className="card p-4 flex items-center justify-between">
            <div className="flex gap-6 text-sm">
              <span><span className="font-semibold">{okRows.length}</span> movimientos</span>
              <span className="text-emerald-600">Abonos: {formatCurrency(totalAbono)}</span>
              <span className="text-rose-600">Cargos: {formatCurrency(totalCargo)}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPreview(null)}
                className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">Cancelar</button>
              <button onClick={handleConfirm} disabled={okRows.length === 0 || loading}
                className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                Importar {okRows.length} movimientos
              </button>
            </div>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-[var(--muted)]">
                <tr>
                  <th className="table-cell text-left font-medium">Fila</th>
                  <th className="table-cell text-left font-medium">Fecha</th>
                  <th className="table-cell text-left font-medium">Glosa</th>
                  <th className="table-cell text-right font-medium">Cargo</th>
                  <th className="table-cell text-right font-medium">Abono</th>
                  <th className="table-cell text-left font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {preview.map(p => (
                  <tr key={p.row} className={`hover:bg-slate-50 ${p.status === "error" ? "bg-rose-50/30" : ""}`}>
                    <td className="table-cell text-[var(--muted)]">{p.row}</td>
                    <td className="table-cell">{p.fecha}</td>
                    <td className="table-cell">{p.glosa}</td>
                    <td className="table-cell text-right text-rose-600">{p.cargo ? formatCurrency(p.cargo) : "—"}</td>
                    <td className="table-cell text-right text-emerald-600">{p.abono ? formatCurrency(p.abono) : "—"}</td>
                    <td className="table-cell">
                      {p.status === "ok" ? <span className="text-xs text-emerald-600">✓</span> : <span className="text-xs text-rose-600">{p.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
