"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";

type DocRow = {
  row: number;
  proveedor_rut: string;
  tipo: string;
  numero: string;
  fecha_emision: string;
  monto_neto: number;
  iva: number;
  monto_total: number;
  status: "ok" | "error";
  error?: string;
};

type Proveedor = { id: number; rut: string; nombre: string };

export default function ImportarDocumentosCompraPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [preview, setPreview] = useState<DocRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ importados: number; errores: number } | null>(null);

  useEffect(() => {
    fetch("/api/compras/proveedores").then(r => r.json()).then(setProveedores);
  }, []);

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
    const rutSet = new Set(proveedores.map(p => p.rut));
    const rows: DocRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      const rut = get(cols, "rut_proveedor") || get(cols, "proveedor_rut") || get(cols, "rut");
      const fecha = get(cols, "fecha_emision") || get(cols, "fecha");
      const neto = parseFloat(get(cols, "monto_neto").replace(/[^0-9.]/g, "") || "0");
      const iva = parseFloat(get(cols, "iva").replace(/[^0-9.]/g, "") || "0");
      const total = parseFloat(get(cols, "monto_total").replace(/[^0-9.]/g, "") || "0") || neto + iva;
      if (!rut || !fecha) {
        rows.push({ row: i + 1, proveedor_rut: rut, tipo: "FACTURA", numero: get(cols, "numero"), fecha_emision: fecha, monto_neto: neto, iva, monto_total: total, status: "error", error: !rut ? "Sin RUT proveedor" : "Sin fecha" });
      } else if (!rutSet.has(rut)) {
        rows.push({ row: i + 1, proveedor_rut: rut, tipo: "FACTURA", numero: get(cols, "numero"), fecha_emision: fecha, monto_neto: neto, iva, monto_total: total, status: "error", error: `RUT ${rut} no existe` });
      } else {
        rows.push({ row: i + 1, proveedor_rut: rut, tipo: get(cols, "tipo") || "FACTURA", numero: get(cols, "numero"), fecha_emision: fecha, monto_neto: neto, iva, monto_total: total, status: "ok" });
      }
    }
    setPreview(rows);
    setLoading(false);
  }

  async function handleConfirm() {
    if (!preview) return;
    setLoading(true);
    const provMap = Object.fromEntries(proveedores.map(p => [p.rut, p.id]));
    const rows = preview.filter(p => p.status === "ok").map(r => ({ ...r, proveedor_id: provMap[r.proveedor_rut] }));
    const r = await fetch("/api/admin/importaciones/documentos-compra/confirmar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    if (r.ok) { setResult(await r.json()); setPreview(null); }
    setLoading(false);
  }

  const okRows = preview?.filter(p => p.status === "ok") ?? [];

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">Importar documentos de compra</h2>
        <p className="text-sm text-[var(--muted)]">Carga masiva de facturas recibidas de proveedores</p>
      </header>
      <div className="card p-5 space-y-3">
        <p className="text-sm text-[var(--muted)]">Columnas CSV: <code className="bg-slate-100 px-1 rounded">rut_proveedor,tipo,numero,fecha_emision,monto_neto,iva,monto_total</code></p>
        <p className="text-xs text-amber-600">Los RUTs de proveedores deben existir en el sistema previamente.</p>
        <input type="file" accept=".csv,.xlsx" onChange={handleFile}
          className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
      </div>
      {loading && <p className="text-sm text-[var(--muted)]">Procesando...</p>}
      {result && (
        <div className="card p-5 grid gap-3 sm:grid-cols-2">
          <div className="text-center"><p className="text-2xl font-bold text-emerald-600">{result.importados}</p><p className="text-xs text-[var(--muted)]">Importados</p></div>
          <div className="text-center"><p className="text-2xl font-bold text-rose-600">{result.errores}</p><p className="text-xs text-[var(--muted)]">Errores</p></div>
        </div>
      )}
      {preview && (
        <div className="space-y-4">
          <div className="card p-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-emerald-600">{okRows.length} listos</span>
            <div className="flex gap-2">
              <button onClick={() => setPreview(null)} className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">Cancelar</button>
              <button onClick={handleConfirm} disabled={okRows.length === 0 || loading}
                className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                Importar {okRows.length}
              </button>
            </div>
          </div>
          <div className="card overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-[var(--muted)]">
                <tr>
                  <th className="table-cell font-medium">Fila</th>
                  <th className="table-cell font-medium">RUT Prov.</th>
                  <th className="table-cell font-medium">Tipo</th>
                  <th className="table-cell font-medium">Fecha</th>
                  <th className="table-cell text-right font-medium">Neto</th>
                  <th className="table-cell text-right font-medium">Total</th>
                  <th className="table-cell font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {preview.map(p => (
                  <tr key={p.row} className={p.status === "error" ? "bg-rose-50/30" : "hover:bg-slate-50"}>
                    <td className="table-cell text-[var(--muted)]">{p.row}</td>
                    <td className="table-cell">{p.proveedor_rut}</td>
                    <td className="table-cell text-xs">{p.tipo}</td>
                    <td className="table-cell">{p.fecha_emision}</td>
                    <td className="table-cell text-right">{formatCurrency(p.monto_neto)}</td>
                    <td className="table-cell text-right font-semibold">{formatCurrency(p.monto_total)}</td>
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
