"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, AlertCircle } from "lucide-react";
import { CaseStage } from "@prisma/client";
import { CategoryBadge } from "@/components/CategoryBadge";
import { BulkAssignBar } from "./BulkAssignBar";

type CaseItem = {
  id: string;
  code: string;
  client: { fullName: string };
  categoria: { name: string } | null;
  stage: CaseStage;
  is_paid: boolean;
  metadata: any;
  createdAt: Date;
};

type Member = { id: string; fullName: string };

type BandejaClientProps = {
  cases: CaseItem[];
  jefes: Member[];
  abogados: Member[];
  role: string;
  currentUserId: string;
  canDerive: boolean;
  searchParams: { category?: string; stage?: string; sort?: string };
};

export function BandejaClient({ cases, jefes, abogados, role, currentUserId, canDerive, searchParams }: BandejaClientProps) {
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      // Only select cases that can be assigned (are paid and not waiting for quotas)
      const assignableIds = cases
        .filter((c) => c.is_paid && c.stage !== CaseStage.WAITING_CUOTAS)
        .map((c) => c.id);
      setSelectedCaseIds(assignableIds);
    } else {
      setSelectedCaseIds([]);
    }
  };

  const handleSelectCase = (id: string) => {
    setSelectedCaseIds((prev) =>
      prev.includes(id) ? prev.filter((caseId) => caseId !== id) : [...prev, id]
    );
  };

  const isAllSelected = cases.length > 0 && selectedCaseIds.length === cases.filter((c) => c.is_paid && c.stage !== CaseStage.WAITING_CUOTAS).length;

  return (
    <>
      <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-sm shadow-sm overflow-hidden mb-6">
        {cases.length === 0 ? (
          <div className="p-16 text-center">
            <div className="flex justify-center mb-4">
              <AlertCircle className="w-10 h-10 text-[var(--border-glass)]" />
            </div>
            <p className="text-sm font-medium text-[var(--text-muted)]">
              No se encontraron registros bajo los criterios actuales.
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr style={{ background: "var(--surface-2)" }}>
                {canDerive && (
                  <th className="px-6 py-4 w-12 border-b border-[var(--border-glass)]">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleSelectAll}
                      className="rounded border-slate-300 text-[var(--gold)] focus:ring-[var(--gold)] cursor-pointer"
                    />
                  </th>
                )}
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] border-b border-[var(--border-glass)]">Expediente</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] border-b border-[var(--border-glass)]">
                  <Link
                    href={`?category=${searchParams.category ?? ""}&stage=${searchParams.stage ?? ""}&sort=${searchParams.sort === "client_asc" ? "" : "client_asc"}`}
                    className="flex items-center gap-1 hover:text-[var(--text)] transition-colors"
                    title="Alternar orden alfabético"
                  >
                    Cliente
                    {searchParams.sort === "client_asc" ? (
                      <span className="text-[var(--text)] font-extrabold">↑ A-Z</span>
                    ) : (
                      <span className="opacity-50 font-normal">⇵</span>
                    )}
                  </Link>
                </th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] border-b border-[var(--border-glass)]">Categoría</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] border-b border-[var(--border-glass)]">Estado Financiero</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-glass)]">
              {cases.map((c) => {
                const isLocked = c.stage === CaseStage.WAITING_CUOTAS || !c.is_paid;
                const isSelected = selectedCaseIds.includes(c.id);

                return (
                  <tr key={c.id} className={`transition-colors group ${isSelected ? "bg-[rgba(255,255,255,0.02)]" : "hover:bg-[var(--surface)]"}`}>
                    {canDerive && (
                      <td className="px-6 py-5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isLocked}
                          onChange={() => handleSelectCase(c.id)}
                          className="rounded border-slate-300 text-[var(--gold)] focus:ring-[var(--gold)] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                          title={isLocked ? "Pago inicial no validado" : "Seleccionar caso"}
                        />
                      </td>
                    )}
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        <div className="font-bold text-[var(--text)] tracking-wider">{c.code}</div>
                        {(c.metadata as any)?.source === "CRM_DANTE" && (
                          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] bg-[rgba(59,130,246,0.1)] text-[8px] font-bold text-blue-400 border border-blue-500/20 uppercase tracking-tighter" title="Verificado por Dante en CRM">
                            <ShieldCheck className="w-2 h-2" />
                            CRM
                          </div>
                        )}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Recibido: {new Date(c.createdAt).toLocaleDateString("es-CL")}</div>
                    </td>

                    <td className="px-6 py-5">
                      <div className="text-sm font-medium text-[var(--text)]">{c.client.fullName}</div>
                    </td>
                    <td className="px-6 py-5">
                      <CategoryBadge category={c.categoria} />
                    </td>

                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        {c.stage === CaseStage.WAITING_CUOTAS ? (
                          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-sm bg-[rgba(249,115,22,0.1)] text-orange-400 border border-orange-500/20">
                            Esperando Cuota 1
                          </span>
                        ) : !c.is_paid ? (
                          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-sm bg-[rgba(239,68,68,0.1)] text-red-400 border border-red-500/20">
                            Deuda Pendiente
                          </span>
                        ) : c.stage === CaseStage.IN_PROGRESS ? (
                          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-sm bg-[rgba(59,130,246,0.1)] text-blue-400 border border-blue-500/20">
                            En Proceso
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-sm bg-[rgba(34,197,94,0.1)] text-green-400 border border-green-500/20">
                            Al Día
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <BulkAssignBar
        selectedCaseIds={selectedCaseIds}
        jefes={jefes}
        abogados={abogados}
        onClearSelection={() => setSelectedCaseIds([])}
        currentUserId={currentUserId}
        role={role}
      />
    </>
  );
}
