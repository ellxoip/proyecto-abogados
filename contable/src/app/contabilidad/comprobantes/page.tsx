"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";

interface Comprobante {
  id: number; numero: number; fecha_comprobante: string; descripcion: string;
  estado: string; total_debe: string; total_haber: string;
  tipo: { nombre: string; prefijo: string | null };
  usuario: { nombre: string } | null;
}

const ESTADO_COLOR: Record<string, string> = {
  BORRADOR: "bg-slate-100 text-slate-600",
  APROBADO: "bg-emerald-100 text-emerald-700",
  ANULADO: "bg-rose-100 text-rose-600",
};

export default function ComprobantesPage() {
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [estadoFiltro, setEstadoFiltro] = useState("");

  async function load() {
    const p = new URLSearchParams();
    if (estadoFiltro) p.set("estado", estadoFiltro);
    const r = await fetch("/api/contabilidad/comprobantes?" + p);
    setComprobantes(await r.json());
  }
  useEffect(() => {
    const p = new URLSearchParams();
    if (estadoFiltro) p.set("estado", estadoFiltro);
    fetch("/api/contabilidad/comprobantes?" + p).then(r => r.json()).then(setComprobantes);
  }, [estadoFiltro]);

  async function contabilizar(id: number) {
    await fetch(`/api/contabilidad/comprobantes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "APROBADO" }) });
    load();
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Comprobantes contables</h2>
          <p className="text-sm text-[var(--muted)]">Asientos contables por tipo</p>
        </div>
        <Link href="/contabilidad/comprobantes/nuevo" className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">Nuevo comprobante</Link>
      </header>

      <select className="rounded border border-[var(--border)] px-3 py-2 text-sm" value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)}>
        <option value="">Todos los estados</option>
        <option value="BORRADOR">Borrador</option>
        <option value="APROBADO">Aprobado</option>
        <option value="ANULADO">Anulado</option>
      </select>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-[var(--muted)]">
            <tr>
              <th className="table-cell text-left font-medium">N°</th>
              <th className="table-cell text-left font-medium">Tipo</th>
              <th className="table-cell text-left font-medium">Fecha</th>
              <th className="table-cell text-left font-medium">Descripción</th>
              <th className="table-cell text-left font-medium">Usuario</th>
              <th className="table-cell text-left font-medium">Estado</th>
              <th className="table-cell text-right font-medium">Debe</th>
              <th className="table-cell text-right font-medium">Haber</th>
              <th className="table-cell text-center font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {comprobantes.map(c => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="table-cell font-mono">{c.tipo.prefijo ?? ""}{c.numero}</td>
                <td className="table-cell">{c.tipo.nombre}</td>
                <td className="table-cell">{formatDate(c.fecha_comprobante)}</td>
                <td className="table-cell">{c.descripcion}</td>
                <td className="table-cell text-[var(--muted)]">{c.usuario?.nombre ?? "—"}</td>
                <td className="table-cell">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_COLOR[c.estado] ?? ""}`}>{c.estado}</span>
                </td>
                <td className="table-cell text-right">{formatCurrency(Number(c.total_debe))}</td>
                <td className="table-cell text-right">{formatCurrency(Number(c.total_haber))}</td>
                <td className="table-cell text-center">
                  <div className="flex gap-1 justify-center">
                    <Link href={`/contabilidad/comprobantes/${c.id}`} className="text-xs text-[var(--accent)] hover:underline">Ver</Link>
                    {c.estado === "BORRADOR" && <button onClick={() => contabilizar(c.id)} className="text-xs text-emerald-600 hover:underline">Contabilizar</button>}
                  </div>
                </td>
              </tr>
            ))}
            {comprobantes.length === 0 && <tr><td colSpan={9} className="table-cell text-center text-[var(--muted)]">Sin comprobantes.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
