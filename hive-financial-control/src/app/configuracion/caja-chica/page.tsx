"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";

type Fondo = {
  id: number;
  nombre: string;
  monto_asignado: string;
  saldo_actual: string;
  monto_max_gasto: string;
  activo: boolean;
  responsable: { nombre: string };
};

export default function ConfigCajaCHicaPage() {
  const [fondos, setFondos] = useState<Fondo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tesoreria/caja-chica/fondos").then(r => r.json()).then(data => {
      setFondos(data);
      setLoading(false);
    });
  }, []);

  return (
    <section className="space-y-6">
      <header>
        <Link href="/configuracion" className="text-xs text-[var(--muted)] hover:underline">← Configuración</Link>
        <h2 className="mt-1 text-2xl font-semibold">Configuración caja chica</h2>
        <p className="text-sm text-[var(--muted)]">Parámetros de fondos, montos y flujos de aprobación</p>
      </header>

      <div className="card p-5 space-y-3">
        <h3 className="font-semibold">Flujo de aprobación</h3>
        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          <div className="rounded-lg border border-[var(--border)] p-3">
            <p className="font-medium">1. Registro de gasto</p>
            <p className="text-[var(--muted)] text-xs mt-1">Responsable del fondo registra el gasto con comprobante</p>
          </div>
          <div className="rounded-lg border border-[var(--border)] p-3">
            <p className="font-medium">2. Rendición</p>
            <p className="text-[var(--muted)] text-xs mt-1">Se agrupan gastos del período y se envía para aprobación</p>
          </div>
          <div className="rounded-lg border border-[var(--border)] p-3">
            <p className="font-medium">3. Reposición</p>
            <p className="text-[var(--muted)] text-xs mt-1">Al aprobar rendición, se solicita la reposición del fondo</p>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Cargando...</p>
      ) : (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
            <h3 className="font-semibold text-sm">Fondos configurados</h3>
            <Link href="/tesoreria/caja-chica/fondos"
              className="text-xs text-[var(--accent)] hover:underline">Gestionar fondos →</Link>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-[var(--muted)]">
              <tr>
                <th className="table-cell text-left font-medium">Fondo</th>
                <th className="table-cell text-left font-medium">Responsable</th>
                <th className="table-cell text-right font-medium">Monto asignado</th>
                <th className="table-cell text-right font-medium">Saldo actual</th>
                <th className="table-cell text-right font-medium">Máx. por gasto</th>
                <th className="table-cell text-left font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {fondos.map(f => (
                <tr key={f.id} className="hover:bg-slate-50">
                  <td className="table-cell font-medium">{f.nombre}</td>
                  <td className="table-cell text-[var(--muted)]">{f.responsable.nombre}</td>
                  <td className="table-cell text-right">{formatCurrency(Number(f.monto_asignado))}</td>
                  <td className="table-cell text-right font-semibold">{formatCurrency(Number(f.saldo_actual))}</td>
                  <td className="table-cell text-right">{formatCurrency(Number(f.monto_max_gasto))}</td>
                  <td className="table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${f.activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {f.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                </tr>
              ))}
              {fondos.length === 0 && <tr><td colSpan={6} className="table-cell text-center text-[var(--muted)]">Sin fondos configurados</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div className="card p-4 bg-blue-50">
        <p className="text-sm text-blue-700">Para crear o modificar fondos, ve a <Link href="/tesoreria/caja-chica/fondos" className="underline">Tesorería → Caja chica → Fondos</Link>.</p>
      </div>
    </section>
  );
}
