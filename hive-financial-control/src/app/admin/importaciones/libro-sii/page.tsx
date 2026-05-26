"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/format";

type LibroRow = {
  tipo_libro: "VENTAS" | "COMPRAS";
  tipo_doc: string;
  folio: string;
  fecha: string;
  rut: string;
  razon_social: string;
  monto_neto: number;
  iva: number;
  monto_total: number;
};

type SyncResult = {
  libro: string;
  importados: number;
  ya_existentes: number;
  errores: number;
};

export default function ImportarLibroSIIPage() {
  const [libro, setLibro] = useState<"VENTAS" | "COMPRAS">("VENTAS");
  const [preview, setPreview] = useState<LibroRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setResult(null);
    setLoading(true);
    const text = await f.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) { setLoading(false); return; }
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/"/g, ""));
    const get = (cols: string[], name: string) => cols[headers.indexOf(name)]?.trim().replace(/"/g, "") ?? "";
    const rows: LibroRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      const neto = parseFloat(get(cols, "monto_neto").replace(/[^0-9.]/g, "") || "0");
      const iva = parseFloat(get(cols, "iva").replace(/[^0-9.]/g, "") || "0");
      const total = parseFloat(get(cols, "monto_total").replace(/[^0-9.]/g, "") || "0") || neto + iva;
      rows.push({
        tipo_libro: libro,
        tipo_doc: get(cols, "tipo_doc") || get(cols, "tipo"),
        folio: get(cols, "folio") || get(cols, "numero"),
        fecha: get(cols, "fecha_emision") || get(cols, "fecha"),
        rut: get(cols, "rut"),
        razon_social: get(cols, "razon_social") || get(cols, "nombre"),
        monto_neto: neto,
        iva,
        monto_total: total,
      });
    }
    setPreview(rows.filter(r => r.fecha && r.rut));
    setLoading(false);
  }

  async function handleConfirm() {
    if (!preview) return;
    setLoading(true);
    const r = await fetch("/api/admin/importaciones/libro-sii/confirmar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: preview, tipo_libro: libro }),
    });
    if (r.ok) { setResult(await r.json()); setPreview(null); }
    setLoading(false);
  }

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">Importar libro SII</h2>
        <p className="text-sm text-[var(--muted)]">Sincronizar libro de compras/ventas desde archivo del SII</p>
      </header>

      <div className="card p-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Tipo de libro</label>
            <select value={libro} onChange={e => setLibro(e.target.value as "VENTAS" | "COMPRAS")}
              className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm">
              <option value="VENTAS">Libro de ventas</option>
              <option value="COMPRAS">Libro de compras</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Archivo CSV del SII</label>
            <input type="file" accept=".csv,.xlsx" onChange={handleFile}
              className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
          </div>
        </div>
        <p className="text-sm text-[var(--muted)]">Columnas esperadas: <code className="bg-slate-100 px-1 rounded">tipo_doc, folio, fecha_emision, rut, razon_social, monto_neto, iva, monto_total</code></p>
      </div>

      {loading && <p className="text-sm text-[var(--muted)]">Procesando...</p>}

      {result && (
        <div className="card p-5">
          <p className="font-semibold text-emerald-600 mb-3">Libro {result.libro} importado</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="text-center"><p className="text-2xl font-bold text-emerald-600">{result.importados}</p><p className="text-xs text-[var(--muted)]">Importados</p></div>
            <div className="text-center"><p className="text-2xl font-bold text-amber-600">{result.ya_existentes}</p><p className="text-xs text-[var(--muted)]">Ya existentes</p></div>
            <div className="text-center"><p className="text-2xl font-bold text-rose-600">{result.errores}</p><p className="text-xs text-[var(--muted)]">Errores</p></div>
          </div>
        </div>
      )}

      {preview && (
        <div className="space-y-4">
          <div className="card p-4 flex items-center justify-between">
            <span className="text-sm">{preview.length} registros del libro de {libro.toLowerCase()}</span>
            <div className="flex gap-2">
              <button onClick={() => setPreview(null)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">Cancelar</button>
              <button onClick={handleConfirm} disabled={loading}
                className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                Importar {preview.length}
              </button>
            </div>
          </div>
          <div className="card overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-[var(--muted)]">
                <tr>
                  <th className="table-cell font-medium">Fecha</th>
                  <th className="table-cell font-medium">Tipo DTE</th>
                  <th className="table-cell font-medium">Folio</th>
                  <th className="table-cell font-medium">RUT</th>
                  <th className="table-cell font-medium">Razón social</th>
                  <th className="table-cell text-right font-medium">Neto</th>
                  <th className="table-cell text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {preview.slice(0, 50).map((p, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="table-cell">{p.fecha}</td>
                    <td className="table-cell text-xs">{p.tipo_doc}</td>
                    <td className="table-cell text-[var(--muted)]">{p.folio}</td>
                    <td className="table-cell">{p.rut}</td>
                    <td className="table-cell">{p.razon_social}</td>
                    <td className="table-cell text-right">{formatCurrency(p.monto_neto)}</td>
                    <td className="table-cell text-right font-semibold">{formatCurrency(p.monto_total)}</td>
                  </tr>
                ))}
                {preview.length > 50 && (
                  <tr><td colSpan={7} className="table-cell text-center text-[var(--muted)]">... y {preview.length - 50} más</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
