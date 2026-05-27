"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";

type EntidadBase = "clientes" | "contratos" | "pagos" | "cuotas" | "gestiones";

const ENTIDADES: { value: EntidadBase; label: string; columnas: { key: string; label: string }[] }[] = [
  {
    value: "clientes",
    label: "Clientes",
    columnas: [
      { key: "nombre", label: "Nombre" },
      { key: "rut", label: "RUT" },
      { key: "tipo_cliente", label: "Tipo" },
      { key: "estado", label: "Estado" },
      { key: "fecha_ingreso", label: "Fecha ingreso" },
    ],
  },
  {
    value: "contratos",
    label: "Contratos",
    columnas: [
      { key: "cliente.nombre", label: "Cliente" },
      { key: "tipo_servicio", label: "Servicio" },
      { key: "monto_ccto", label: "Monto" },
      { key: "estado", label: "Estado" },
      { key: "fecha_contrato", label: "Fecha" },
      { key: "cantidad_cuotas_original", label: "Cuotas" },
    ],
  },
  {
    value: "pagos",
    label: "Pagos",
    columnas: [
      { key: "cliente.nombre", label: "Cliente" },
      { key: "fecha_pago", label: "Fecha" },
      { key: "monto_pagado", label: "Monto" },
      { key: "medio_pago", label: "Medio" },
      { key: "estado", label: "Estado" },
    ],
  },
  {
    value: "cuotas",
    label: "Cuotas",
    columnas: [
      { key: "contrato.cliente.nombre", label: "Cliente" },
      { key: "numero_cuota", label: "N°" },
      { key: "monto_actual", label: "Monto" },
      { key: "fecha_vencimiento", label: "Vencimiento" },
      { key: "estado", label: "Estado" },
      { key: "saldo_pendiente", label: "Saldo" },
    ],
  },
];

type ReporteRow = Record<string, string | number | null>;

export default function ReportesPersonalizadosPage() {
  const [entidad, setEntidad] = useState<EntidadBase>("clientes");
  const [columnas, setColumnas] = useState<string[]>(["nombre","rut","estado"]);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [results, setResults] = useState<ReporteRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [reporteGuardado, setReporteGuardado] = useState<string | null>(null);

  const entidadDef = ENTIDADES.find(e => e.value === entidad)!;

  function toggleColumna(key: string) {
    setColumnas(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]);
  }

  async function handleGenerar() {
    setLoading(true);
    const params = new URLSearchParams({ entidad, columnas: columnas.join(",") });
    if (filtroEstado) params.append("estado", filtroEstado);
    const r = await fetch(`/api/bi/reporte-personalizado?${params}`);
    if (r.ok) setResults(await r.json());
    setLoading(false);
  }

  function handleGuardar() {
    const nombre = prompt("Nombre del reporte:");
    if (nombre) {
      const reportes = JSON.parse(localStorage.getItem("reportes_personalizados") ?? "[]");
      reportes.push({ nombre, entidad, columnas, filtroEstado, fecha: new Date().toISOString() });
      localStorage.setItem("reportes_personalizados", JSON.stringify(reportes));
      setReporteGuardado(nombre);
    }
  }

  const columnasSeleccionadas = entidadDef.columnas.filter(c => columnas.includes(c.key));

  return (
    <section className="space-y-6">
      <header>
        <Link href="/bi" className="text-xs text-[var(--muted)] hover:underline">← BI</Link>
        <h2 className="text-2xl font-semibold mt-1">Reportes personalizados</h2>
        <p className="text-sm text-[var(--muted)]">Genera reportes ad-hoc con columnas y filtros dinámicos</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <h3 className="font-semibold text-sm">1. Entidad base</h3>
            <div className="space-y-1">
              {ENTIDADES.map(e => (
                <label key={e.value} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="entidad" value={e.value} checked={entidad === e.value}
                    onChange={() => { setEntidad(e.value); setColumnas(e.columnas.slice(0, 3).map(c => c.key)); setResults(null); }}
                    className="text-[var(--accent)]" />
                  <span className="text-sm">{e.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="card p-4 space-y-3">
            <h3 className="font-semibold text-sm">2. Columnas</h3>
            <div className="space-y-1">
              {entidadDef.columnas.map(c => (
                <label key={c.key} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={columnas.includes(c.key)} onChange={() => toggleColumna(c.key)}
                    className="text-[var(--accent)]" />
                  <span className="text-sm">{c.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="card p-4 space-y-3">
            <h3 className="font-semibold text-sm">3. Filtros</h3>
            <div>
              <label className="mb-1 block text-xs text-[var(--muted)]">Estado</label>
              <input value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
                placeholder="ACTIVO, PAGADA, VIGENTE..."
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
          </div>

          <button onClick={handleGenerar} disabled={columnas.length === 0 || loading}
            className="w-full rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {loading ? "Generando..." : "Generar reporte"}
          </button>
        </div>

        <div className="lg:col-span-2">
          {results === null ? (
            <div className="card p-8 text-center text-[var(--muted)]">
              <p className="text-sm">Configura las opciones y haz clic en Generar</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{results.length} registros</p>
                <div className="flex gap-2">
                  <button onClick={handleGuardar}
                    className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-slate-50">
                    Guardar reporte
                  </button>
                </div>
              </div>
              {reporteGuardado && <p className="text-xs text-emerald-600">Reporte &quot;{reporteGuardado}&quot; guardado</p>}
              <div className="card overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-[var(--muted)]">
                    <tr>
                      {columnasSeleccionadas.map(c => (
                        <th key={c.key} className="table-cell text-left font-medium">{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {results.slice(0, 100).map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        {columnasSeleccionadas.map(c => (
                          <td key={c.key} className="table-cell">
                            {typeof row[c.key] === "number" && c.key.includes("monto")
                              ? formatCurrency(row[c.key] as number)
                              : String(row[c.key] ?? "—")}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {results.length > 100 && (
                      <tr><td colSpan={columnasSeleccionadas.length} className="table-cell text-center text-[var(--muted)]">
                        ... y {results.length - 100} más
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
