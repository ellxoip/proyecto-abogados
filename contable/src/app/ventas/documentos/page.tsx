"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";

interface Documento {
  id: number; tipo: string; numero: number | null; razon_social: string;
  rut_receptor: string | null; fecha_emision: string; estado: string;
  monto_neto: string; iva: string; monto_total: string;
  cliente: { nombre: string } | null;
}

const TIPOS = ["FACTURA", "BOLETA", "BOLETA_ELECTRONICA", "FACTURA_ELECTRONICA", "NOTA_DEBITO"];
const ESTADOS = ["EMITIDO", "ACEPTADO_SII", "PAGADO", "ANULADO"];
const ESTADO_COLOR: Record<string, string> = {
  EMITIDO: "bg-slate-100 text-slate-600",
  ACEPTADO_SII: "bg-blue-100 text-blue-700",
  PAGADO: "bg-emerald-100 text-emerald-700",
  ANULADO: "bg-rose-100 text-rose-600",
};

export default function DocumentosPage() {
  const [docs, setDocs] = useState<Documento[]>([]);
  const [tipo, setTipo] = useState("");
  const [estado, setEstado] = useState("");

  async function load() {
    const p = new URLSearchParams();
    if (tipo) p.set("tipo", tipo);
    if (estado) p.set("estado", estado);
    const r = await fetch("/api/ventas/documentos?" + p);
    setDocs(await r.json());
  }
  useEffect(() => {
    const p = new URLSearchParams();
    if (tipo) p.set("tipo", tipo);
    if (estado) p.set("estado", estado);
    fetch("/api/ventas/documentos?" + p).then(r => r.json()).then(setDocs);
  }, [tipo, estado]);

  async function cambiarEstado(id: number, nuevoEstado: string) {
    await fetch(`/api/ventas/documentos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: nuevoEstado }) });
    load();
  }

  const totales = docs.reduce((a, d) => ({ neto: a.neto + Number(d.monto_neto), total: a.total + Number(d.monto_total) }), { neto: 0, total: 0 });

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Documentos de venta</h2>
          <p className="text-sm text-[var(--muted)]">Facturas, boletas y notas de crédito</p>
        </div>
        <Link href="/ventas/documentos/nuevo" className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Nuevo documento
        </Link>
      </header>

      <div className="flex gap-3 flex-wrap">
        <select className="rounded border border-[var(--border)] px-3 py-2 text-sm" value={tipo} onChange={e => setTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {TIPOS.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
        </select>
        <select className="rounded border border-[var(--border)] px-3 py-2 text-sm" value={estado} onChange={e => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <div className="ml-auto flex gap-4 items-center text-sm">
          <span className="text-[var(--muted)]">Neto: <strong>{formatCurrency(totales.neto)}</strong></span>
          <span className="text-[var(--muted)]">Total: <strong>{formatCurrency(totales.total)}</strong></span>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">Tipo</th>
              <th className="table-cell text-left font-medium">N°</th>
              <th className="table-cell text-left font-medium">Receptor</th>
              <th className="table-cell text-left font-medium">Emisión</th>
              <th className="table-cell text-left font-medium">Estado</th>
              <th className="table-cell text-right font-medium">Neto</th>
              <th className="table-cell text-right font-medium">IVA</th>
              <th className="table-cell text-right font-medium">Total</th>
              <th className="table-cell text-center font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {docs.map(d => (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="table-cell font-medium">{d.tipo.replace(/_/g, " ")}</td>
                <td className="table-cell text-[var(--muted)]">{d.numero ?? "—"}</td>
                <td className="table-cell">
                  <p>{d.razon_social}</p>
                  {d.rut_receptor && <p className="text-xs text-[var(--muted)]">{d.rut_receptor}</p>}
                </td>
                <td className="table-cell">{formatDate(d.fecha_emision)}</td>
                <td className="table-cell">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_COLOR[d.estado] ?? ""}`}>{d.estado}</span>
                </td>
                <td className="table-cell text-right">{formatCurrency(Number(d.monto_neto))}</td>
                <td className="table-cell text-right">{formatCurrency(Number(d.iva))}</td>
                <td className="table-cell text-right font-semibold">{formatCurrency(Number(d.monto_total))}</td>
                <td className="table-cell text-center">
                  <div className="flex gap-1 justify-center flex-wrap">
                    {d.estado === "EMITIDO" && <button onClick={() => cambiarEstado(d.id, "ACEPTADO_SII")} className="text-xs text-blue-600 hover:underline">Aceptar SII</button>}
                    {d.estado === "ACEPTADO_SII" && <button onClick={() => cambiarEstado(d.id, "PAGADO")} className="text-xs text-emerald-600 hover:underline">Pagar</button>}
                    {d.estado !== "ANULADO" && <button onClick={() => cambiarEstado(d.id, "ANULADO")} className="text-xs text-rose-500 hover:underline">Anular</button>}
                  </div>
                </td>
              </tr>
            ))}
            {docs.length === 0 && (
              <tr><td colSpan={9} className="table-cell text-center text-[var(--muted)]">Sin documentos.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
