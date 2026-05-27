"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";

interface Comprobante {
  id: number;
  numero: number;
  fecha_comprobante: string;
  descripcion: string;
  estado: string;
  total_debe: string;
  total_haber: string;
  tipo: { nombre: string; prefijo: string | null };
  usuario: { nombre: string } | null;
}

const ESTADO_COLOR: Record<string, string> = {
  BORRADOR: "bg-amber-100 text-amber-700",
  APROBADO: "bg-emerald-100 text-emerald-700",
  ANULADO: "bg-rose-100 text-rose-600",
};

export default function AjustesContablesPage() {
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [tipos, setTipos] = useState<{ id: number; nombre: string }[]>([]);
  const [estadoFiltro, setEstadoFiltro] = useState("BORRADOR");
  const [tipoFiltro, setTipoFiltro] = useState("");

  async function load(estado: string, tipo: string) {
    const p = new URLSearchParams();
    if (estado) p.set("estado", estado);
    if (tipo) p.set("tipo_id", tipo);
    const r = await fetch("/api/contabilidad/comprobantes?" + p);
    setComprobantes(await r.json());
  }

  useEffect(() => {
    fetch("/api/contabilidad/tipos-comprobante").then(r => r.json()).then(setTipos);
    load(estadoFiltro, tipoFiltro);
  }, []);

  useEffect(() => {
    load(estadoFiltro, tipoFiltro);
  }, [estadoFiltro, tipoFiltro]);

  async function contabilizar(id: number) {
    await fetch(`/api/contabilidad/comprobantes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "APROBADO" }),
    });
    load(estadoFiltro, tipoFiltro);
  }

  async function anular(id: number) {
    await fetch(`/api/contabilidad/comprobantes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "ANULADO" }),
    });
    load(estadoFiltro, tipoFiltro);
  }

  const totalDebe = comprobantes.reduce((s, c) => s + Number(c.total_debe), 0);
  const totalHaber = comprobantes.reduce((s, c) => s + Number(c.total_haber), 0);

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <Link href="/contabilidad" className="text-xs text-[var(--muted)] hover:underline">
            ← Contabilidad
          </Link>
          <h2 className="mt-1 text-2xl font-semibold">Ajustes contables</h2>
          <p className="text-sm text-[var(--muted)]">Comprobantes de ajuste y corrección de período</p>
        </div>
        <Link
          href="/contabilidad/comprobantes/nuevo"
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Nuevo ajuste
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <select
          className="rounded border border-[var(--border)] px-3 py-2 text-sm"
          value={estadoFiltro}
          onChange={(e) => setEstadoFiltro(e.target.value)}
        >
          <option value="">Todos los estados</option>
          <option value="BORRADOR">Borrador</option>
          <option value="APROBADO">Aprobado</option>
          <option value="ANULADO">Anulado</option>
        </select>
        <select
          className="rounded border border-[var(--border)] px-3 py-2 text-sm"
          value={tipoFiltro}
          onChange={(e) => setTipoFiltro(e.target.value)}
        >
          <option value="">Todos los tipos</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-4 text-sm">
          <span className="text-[var(--muted)]">
            Debe: <strong>{formatCurrency(totalDebe)}</strong>
          </span>
          <span className="text-[var(--muted)]">
            Haber: <strong>{formatCurrency(totalHaber)}</strong>
          </span>
        </div>
      </div>

      {estadoFiltro === "BORRADOR" && comprobantes.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {comprobantes.length} comprobante{comprobantes.length !== 1 ? "s" : ""} pendiente
          {comprobantes.length !== 1 ? "s" : ""} de aprobación.
        </div>
      )}

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
            {comprobantes.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="table-cell font-mono">
                  {c.tipo.prefijo ?? ""}{c.numero}
                </td>
                <td className="table-cell text-[var(--muted)]">{c.tipo.nombre}</td>
                <td className="table-cell">{formatDate(c.fecha_comprobante)}</td>
                <td className="table-cell">{c.descripcion}</td>
                <td className="table-cell text-[var(--muted)]">{c.usuario?.nombre ?? "—"}</td>
                <td className="table-cell">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_COLOR[c.estado] ?? ""}`}>
                    {c.estado}
                  </span>
                </td>
                <td className="table-cell text-right">{formatCurrency(Number(c.total_debe))}</td>
                <td className="table-cell text-right">{formatCurrency(Number(c.total_haber))}</td>
                <td className="table-cell text-center">
                  <div className="flex justify-center gap-1">
                    <Link
                      href={`/contabilidad/comprobantes/${c.id}`}
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      Ver
                    </Link>
                    {c.estado === "BORRADOR" && (
                      <button
                        onClick={() => contabilizar(c.id)}
                        className="text-xs text-emerald-600 hover:underline"
                      >
                        Aprobar
                      </button>
                    )}
                    {c.estado === "BORRADOR" && (
                      <button
                        onClick={() => anular(c.id)}
                        className="text-xs text-rose-500 hover:underline"
                      >
                        Anular
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {comprobantes.length === 0 && (
              <tr>
                <td colSpan={9} className="table-cell text-center text-[var(--muted)]">
                  Sin ajustes contables.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
