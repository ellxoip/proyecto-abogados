"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import type { ClienteCuotasResumen, EstadoFinanciero } from "@/server/services/cuotas.service";
import { formatCurrency } from "@/lib/format";

const estadoBadgeClass: Record<EstadoFinanciero, string> = {
  AL_DIA: "bg-emerald-100 text-emerald-700",
  CON_DEUDA: "bg-amber-100 text-amber-700",
  MOROSO: "bg-rose-100 text-rose-700",
  PAGADO: "bg-slate-200 text-slate-700",
  EN_REVISION: "bg-indigo-100 text-indigo-700",
};

const estadoLabel: Record<EstadoFinanciero, string> = {
  AL_DIA: "Al día",
  CON_DEUDA: "Con deuda",
  MOROSO: "Moroso",
  PAGADO: "Pagado",
  EN_REVISION: "En revisión",
};

const rowBgClass: Record<EstadoFinanciero, string> = {
  AL_DIA: "bg-emerald-50/70 hover:bg-emerald-50",
  CON_DEUDA: "bg-amber-50/70 hover:bg-amber-50",
  MOROSO: "bg-rose-50/70 hover:bg-rose-50",
  PAGADO: "bg-white hover:bg-slate-50",
  EN_REVISION: "bg-indigo-50/70 hover:bg-indigo-50",
};

const contratoEstadoLabel: Record<string, string> = {
  ACTIVO: "Activo",
  PENDING_INITIAL_PAYMENT: "Pago inicial pendiente",
  EN_MORA: "En mora",
  REPACTADO: "Repactado",
  PAGADO: "Pagado",
  TERMINADO: "Terminado",
  ANULADO: "Anulado",
};

export function CuotasClienteList({ clientes }: { clientes: ClienteCuotasResumen[] }) {
  const [selected, setSelected] = useState<ClienteCuotasResumen | null>(null);

  const close = useCallback(() => setSelected(null), []);

  return (
    <>
      <div className="space-y-2">
        {clientes.map((cliente) => (
          <div
            key={cliente.id}
            onClick={() => setSelected(cliente)}
            className={`cursor-pointer overflow-hidden rounded-xl border border-slate-200 shadow-sm transition-shadow hover:shadow-md ${rowBgClass[cliente.estadoFinanciero]}`}
          >
            <div className="grid gap-2 px-4 py-4 text-sm md:grid-cols-7 md:items-center">
              <div>
                <p className="text-xs text-slate-400">Cliente</p>
                <p className="font-semibold text-slate-800">{cliente.nombre}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">RUT</p>
                <p className="font-mono text-xs text-slate-600">{cliente.rut}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Servicios</p>
                <p className="text-slate-700">{cliente.cantidadServicios}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Total contratado</p>
                <p className="text-slate-700">{formatCurrency(cliente.totalContratado)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Total pagado</p>
                <p className="text-emerald-700 font-medium">{formatCurrency(cliente.totalPagado)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Saldo pendiente</p>
                <p className={cliente.saldoPendiente > 0 ? "font-medium text-rose-700" : "text-slate-700"}>
                  {formatCurrency(cliente.saldoPendiente)}
                </p>
              </div>
              <div className="flex items-center justify-end gap-2">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${estadoBadgeClass[cliente.estadoFinanciero]}`}
                >
                  {estadoLabel[cliente.estadoFinanciero]}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={close}
        >
          <div
            className="relative w-full max-w-5xl max-h-[88vh] overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-6 py-4 border-b border-slate-200 ${rowBgClass[selected.estadoFinanciero]}`}>
              <div className="flex items-center gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">{selected.nombre}</h3>
                  <p className="text-sm text-slate-500 font-mono">{selected.rut}</p>
                </div>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${estadoBadgeClass[selected.estadoFinanciero]}`}>
                  {estadoLabel[selected.estadoFinanciero]}
                </span>
              </div>
              <button
                onClick={close}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Summary strip */}
            <div className="grid grid-cols-3 gap-px bg-slate-100 border-b border-slate-200">
              <div className="bg-white px-6 py-3">
                <p className="text-xs text-slate-400">Total contratado</p>
                <p className="text-base font-bold text-slate-800">{formatCurrency(selected.totalContratado)}</p>
              </div>
              <div className="bg-white px-6 py-3">
                <p className="text-xs text-slate-400">Total pagado</p>
                <p className="text-base font-bold text-emerald-600">{formatCurrency(selected.totalPagado)}</p>
              </div>
              <div className="bg-white px-6 py-3">
                <p className="text-xs text-slate-400">Saldo pendiente</p>
                <p className={`text-base font-bold ${selected.saldoPendiente > 0 ? "text-rose-600" : "text-slate-700"}`}>
                  {formatCurrency(selected.saldoPendiente)}
                </p>
              </div>
            </div>

            {/* Contracts table */}
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-slate-500 shadow-sm">
                  <tr>
                    <th className="table-cell font-semibold">Servicio</th>
                    <th className="table-cell font-semibold">Código</th>
                    <th className="table-cell font-semibold">Total</th>
                    <th className="table-cell font-semibold">Pagado</th>
                    <th className="table-cell font-semibold">Saldo</th>
                    <th className="table-cell font-semibold">C. Pagadas</th>
                    <th className="table-cell font-semibold">C. Vencidas</th>
                    <th className="table-cell font-semibold">Estado contrato</th>
                    <th className="table-cell font-semibold">Estado financiero</th>
                    <th className="table-cell font-semibold">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.contratos.map((contrato) => (
                    <tr key={contrato.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="table-cell font-medium text-slate-800">{contrato.servicio}</td>
                      <td className="table-cell font-mono text-xs text-slate-500">{contrato.codigo}</td>
                      <td className="table-cell">{formatCurrency(contrato.totalContrato)}</td>
                      <td className="table-cell text-emerald-700">{formatCurrency(contrato.totalPagado)}</td>
                      <td className={`table-cell font-medium ${contrato.saldoPendiente > 0 ? "text-rose-700" : "text-slate-700"}`}>
                        {formatCurrency(contrato.saldoPendiente)}
                      </td>
                      <td className="table-cell">{contrato.cuotasPagadas}</td>
                      <td className="table-cell">
                        {contrato.cuotasVencidas > 0 ? (
                          <span className="font-semibold text-rose-600">{contrato.cuotasVencidas}</span>
                        ) : (
                          <span className="text-slate-500">0</span>
                        )}
                      </td>
                      <td className="table-cell">
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {contratoEstadoLabel[contrato.estadoContrato] ?? contrato.estadoContrato}
                        </span>
                      </td>
                      <td className="table-cell">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${estadoBadgeClass[contrato.estadoFinanciero]}`}>
                          {estadoLabel[contrato.estadoFinanciero]}
                        </span>
                      </td>
                      <td className="table-cell">
                        <Link
                          href={`/cuotas/${contrato.id}`}
                          className="inline-flex items-center gap-1 text-[#0a7ea4] hover:underline"
                          onClick={close}
                        >
                          Ver cuotas
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {selected.contratos.length === 0 && (
                    <tr>
                      <td className="table-cell text-center text-slate-400" colSpan={10}>
                        Sin contratos registrados
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
