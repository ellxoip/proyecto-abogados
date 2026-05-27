"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";

interface Documento {
  id: number;
  numero: number | null;
  razon_social: string;
  rut_receptor: string | null;
  fecha_emision: string;
  estado: string;
  monto_neto: string;
  monto_total: string;
  cliente: { nombre: string } | null;
  observaciones: string | null;
}

const ESTADOS = ["EMITIDO", "ACEPTADO_SII", "PAGADO", "ANULADO"];

const ESTADO_COLOR: Record<string, string> = {
  EMITIDO: "bg-slate-100 text-slate-600",
  ACEPTADO_SII: "bg-blue-100 text-blue-700",
  PAGADO: "bg-emerald-100 text-emerald-700",
  ANULADO: "bg-rose-100 text-rose-600",
};

export default function ComprobantesVentaPage() {
  const [docs, setDocs] = useState<Documento[]>([]);
  const [estado, setEstado] = useState("");

  async function load(e: string) {
    const p = new URLSearchParams({ tipo: "COMPROBANTE_INGRESO" });
    if (e) p.set("estado", e);
    const r = await fetch("/api/ventas/documentos?" + p);
    setDocs(await r.json());
  }

  useEffect(() => {
    load(estado);
  }, [estado]);

  async function cambiarEstado(id: number, nuevoEstado: string) {
    await fetch(`/api/ventas/documentos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: nuevoEstado }),
    });
    load(estado);
  }

  const totalMonto = docs.reduce((s, d) => s + Number(d.monto_total), 0);

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <Link href="/ventas" className="text-xs text-[var(--muted)] hover:underline">
            ← Ventas
          </Link>
          <h2 className="mt-1 text-2xl font-semibold">Comprobantes de ingreso</h2>
          <p className="text-sm text-[var(--muted)]">Comprobantes de ingreso emitidos</p>
        </div>
        <Link
          href="/ventas/documentos/nuevo"
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Nuevo comprobante
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <select
          className="rounded border border-[var(--border)] px-3 py-2 text-sm"
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <div className="ml-auto text-sm text-[var(--muted)]">
          Total: <strong>{formatCurrency(totalMonto)}</strong>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">N°</th>
              <th className="table-cell text-left font-medium">Receptor</th>
              <th className="table-cell text-left font-medium">Emisión</th>
              <th className="table-cell text-left font-medium">Estado</th>
              <th className="table-cell text-left font-medium">Observaciones</th>
              <th className="table-cell text-right font-medium">Monto</th>
              <th className="table-cell text-center font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {docs.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="table-cell font-mono text-[var(--muted)]">{d.numero ?? "—"}</td>
                <td className="table-cell">
                  <p className="font-medium">{d.razon_social}</p>
                  {d.rut_receptor && (
                    <p className="text-xs text-[var(--muted)]">{d.rut_receptor}</p>
                  )}
                </td>
                <td className="table-cell">{formatDate(d.fecha_emision)}</td>
                <td className="table-cell">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_COLOR[d.estado] ?? ""}`}>
                    {d.estado}
                  </span>
                </td>
                <td className="table-cell text-[var(--muted)]">{d.observaciones ?? "—"}</td>
                <td className="table-cell text-right font-semibold">
                  {formatCurrency(Number(d.monto_total))}
                </td>
                <td className="table-cell text-center">
                  <div className="flex flex-wrap justify-center gap-1">
                    {d.estado === "EMITIDO" && (
                      <button
                        onClick={() => cambiarEstado(d.id, "PAGADO")}
                        className="text-xs text-emerald-600 hover:underline"
                      >
                        Pagar
                      </button>
                    )}
                    {d.estado !== "ANULADO" && (
                      <button
                        onClick={() => cambiarEstado(d.id, "ANULADO")}
                        className="text-xs text-rose-500 hover:underline"
                      >
                        Anular
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {docs.length === 0 && (
              <tr>
                <td colSpan={7} className="table-cell text-center text-[var(--muted)]">
                  Sin comprobantes de ingreso.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
