"use client";

import { useState } from "react";

type PreviewRow = {
  row: number;
  rut: string;
  nombre: string;
  giro?: string;
  email?: string;
  telefono?: string;
  banco?: string;
  numero_cuenta?: string;
  status: "ok" | "error" | "duplicate";
  error?: string;
};

export default function ImportarProveedoresPage() {
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ creados: number; errores: number; duplicados: number } | null>(null);
  const [file, setFile] = useState<File | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);

    setLoading(true);
    const formData = new FormData();
    formData.append("file", f);
    const r = await fetch("/api/admin/importaciones/proveedores/preview", { method: "POST", body: formData });
    if (r.ok) setPreview(await r.json());
    setLoading(false);
  }

  async function handleConfirm() {
    if (!preview) return;
    setLoading(true);
    const rows = preview.filter(p => p.status === "ok");
    const r = await fetch("/api/admin/importaciones/proveedores/confirmar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    if (r.ok) {
      const data = await r.json();
      setResult(data);
      setPreview(null);
      setFile(null);
    }
    setLoading(false);
  }

  const okRows = preview?.filter(p => p.status === "ok").length ?? 0;
  const errorRows = preview?.filter(p => p.status === "error").length ?? 0;
  const dupRows = preview?.filter(p => p.status === "duplicate").length ?? 0;

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">Importar proveedores</h2>
        <p className="text-sm text-[var(--muted)]">Carga masiva de proveedores desde Excel o CSV</p>
      </header>

      <div className="card p-5 space-y-4">
        <div>
          <h3 className="font-semibold mb-2">Formato esperado</h3>
          <p className="text-sm text-[var(--muted)] mb-3">Columnas requeridas: <code className="bg-slate-100 px-1 rounded">rut</code>, <code className="bg-slate-100 px-1 rounded">nombre</code>. Opcionales: giro, email, telefono, banco, numero_cuenta, tipo_cuenta_pago, categoria</p>
          <a
            href="/plantillas/proveedores.csv"
            download
            className="text-sm text-[var(--accent)] hover:underline"
          >
            Descargar plantilla CSV
          </a>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Archivo Excel o CSV</label>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          />
        </div>
      </div>

      {loading && <p className="text-sm text-[var(--muted)]">Procesando...</p>}

      {result && (
        <div className="card p-5 space-y-3">
          <h3 className="font-semibold text-emerald-600">Importación completada</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-600">{result.creados}</p>
              <p className="text-xs text-[var(--muted)]">Creados</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-600">{result.duplicados}</p>
              <p className="text-xs text-[var(--muted)]">Duplicados omitidos</p>
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
              <span className="text-emerald-600 font-semibold">{okRows} listos</span>
              <span className="text-amber-600 font-semibold">{dupRows} duplicados</span>
              <span className="text-rose-600 font-semibold">{errorRows} errores</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setPreview(null); setFile(null); }}
                className="rounded-md border border-[var(--border)] px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                disabled={okRows === 0 || loading}
                className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Confirmar {okRows} proveedores
              </button>
            </div>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-[var(--muted)]">
                <tr>
                  <th className="table-cell text-left font-medium">Fila</th>
                  <th className="table-cell text-left font-medium">RUT</th>
                  <th className="table-cell text-left font-medium">Nombre</th>
                  <th className="table-cell text-left font-medium">Giro</th>
                  <th className="table-cell text-left font-medium">Email</th>
                  <th className="table-cell text-left font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {preview.map(p => (
                  <tr key={p.row} className={`hover:bg-slate-50 ${p.status === "error" ? "bg-rose-50/30" : p.status === "duplicate" ? "bg-amber-50/30" : ""}`}>
                    <td className="table-cell text-[var(--muted)]">{p.row}</td>
                    <td className="table-cell">{p.rut}</td>
                    <td className="table-cell">{p.nombre}</td>
                    <td className="table-cell text-[var(--muted)]">{p.giro ?? "—"}</td>
                    <td className="table-cell text-[var(--muted)]">{p.email ?? "—"}</td>
                    <td className="table-cell">
                      {p.status === "ok" && <span className="text-xs text-emerald-600">✓ OK</span>}
                      {p.status === "duplicate" && <span className="text-xs text-amber-600">Duplicado</span>}
                      {p.status === "error" && <span className="text-xs text-rose-600">{p.error}</span>}
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
