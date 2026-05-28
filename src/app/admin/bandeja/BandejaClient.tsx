"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, AlertTriangle, Users, UserCog, UserX, Inbox } from "lucide-react";
import { CaseStage } from "@/lib/db-enums";
import { CategoryBadge } from "@/components/CategoryBadge";
import { BulkAssignBar } from "./BulkAssignBar";
import { stageLabel, stageDescription } from "@/lib/labels";
import { EmptyState } from "@/components/EmptyState";

type AssigneeRef = { id: string; fullName: string };

type CaseItem = {
  id: string;
  code: string;
  client: { fullName: string };
  categoria: { name: string } | null;
  stage: CaseStage;
  is_paid: boolean;
  metadata: any;
  createdAt: Date;
  abogados: AssigneeRef[];
  jefeMesa: AssigneeRef | null;
  unpaid_months?: number;
};

function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function AssignedAvatars({ people, max = 3 }: { people: AssigneeRef[]; max?: number }) {
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex -space-x-2">
      {shown.map((p) => (
        <div
          key={p.id}
          title={p.fullName}
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2"
          style={{
            background: "linear-gradient(135deg, var(--gold) 0%, var(--gold-soft) 100%)",
            color: "#FFFFFF",
            borderColor: "var(--surface)",
          }}
        >
          {initials(p.fullName)}
        </div>
      ))}
      {extra > 0 && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2"
          style={{
            background: "var(--surface-3)",
            color: "var(--text-muted)",
            borderColor: "var(--surface)",
          }}
          title={people.slice(max).map((p) => p.fullName).join(", ")}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}

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

  // Per business rule: only cases with 3+ unpaid months are blocked from assignment.
  // (Plus the existing rule that the case must have a validated initial payment.)
  const isAssignable = (c: CaseItem) =>
    c.is_paid && c.stage !== CaseStage.WAITING_CUOTAS && (c.unpaid_months ?? 0) < 3;

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedCaseIds(cases.filter(isAssignable).map((c) => c.id));
    } else {
      setSelectedCaseIds([]);
    }
  };

  const handleSelectCase = (id: string) => {
    setSelectedCaseIds((prev) =>
      prev.includes(id) ? prev.filter((caseId) => caseId !== id) : [...prev, id]
    );
  };

  const assignableCount = cases.filter(isAssignable).length;
  const isAllSelected = assignableCount > 0 && selectedCaseIds.length === assignableCount;

  return (
    <>
      <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-sm shadow-sm overflow-x-auto mb-6">
        {cases.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No hay casos en la bandeja"
            description="Cuando ingresen nuevos expedientes (manualmente o desde el CRM), aparecerán aquí listos para revisión y asignación. Si esperabas ver casos, revisa los filtros de categoría o estado."
            size="lg"
          />
        ) : (
          <table className="w-full min-w-[760px] text-left border-collapse">
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
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] border-b border-[var(--border-glass)]">Equipo Asignado</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] border-b border-[var(--border-glass)]">Estado Financiero</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-glass)]">
              {cases.map((c) => {
                const overdueMonths = c.unpaid_months ?? 0;
                const isHardLocked = overdueMonths >= 3;
                const isLocked = c.stage === CaseStage.WAITING_CUOTAS || !c.is_paid || isHardLocked;
                const isMoroso = !c.is_paid || overdueMonths > 0;
                const isSelected = selectedCaseIds.includes(c.id);

                const rowStyle: React.CSSProperties | undefined = isMoroso
                  ? {
                      background: isHardLocked ? "rgba(220, 38, 38, 0.07)" : "rgba(220, 38, 38, 0.035)",
                      borderLeft: `3px solid ${isHardLocked ? "var(--red)" : "rgba(220, 38, 38, 0.50)"}`,
                    }
                  : undefined;

                return (
                  <tr
                    key={c.id}
                    className={`transition-colors group ${isSelected ? "bg-[var(--surface-3)]" : isMoroso ? "" : "hover:bg-[var(--surface)]"}`}
                    style={rowStyle}
                  >
                    {canDerive && (
                      <td className="px-6 py-5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isLocked}
                          onChange={() => handleSelectCase(c.id)}
                          className="rounded border-slate-300 text-[var(--gold)] focus:ring-[var(--gold)] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                          title={
                            isHardLocked
                              ? "Bloqueado: 3 o más cuotas vencidas"
                              : isLocked
                              ? "Pago inicial no validado"
                              : "Seleccionar caso"
                          }
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
                        {isHardLocked && (
                          <span title="Caso bloqueado por mora 3+">
                            <AlertTriangle className="w-3.5 h-3.5 text-[var(--red)]" />
                          </span>
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
                      {c.abogados.length === 0 && !c.jefeMesa ? (
                        <div className="flex items-center gap-2 text-[var(--text-dim)]">
                          <UserX className="w-3.5 h-3.5" />
                          <span className="text-[11px] italic">Sin asignar</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {c.abogados.length > 0 && (
                            <div className="flex items-center gap-2">
                              <AssignedAvatars people={c.abogados} />
                              <span className="text-[11px] text-[var(--text-muted)]">
                                {c.abogados.length === 1
                                  ? c.abogados[0].fullName
                                  : `${c.abogados.length} abogados`}
                              </span>
                            </div>
                          )}
                          {c.jefeMesa && (
                            <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                              <UserCog className="w-3 h-3" />
                              <span className="truncate max-w-[160px]" title={c.jefeMesa.fullName}>
                                Jefe: {c.jefeMesa.fullName}
                              </span>
                            </div>
                          )}
                          {c.abogados.length === 0 && c.jefeMesa && (
                            <div className="flex items-center gap-1.5 text-[10px] text-[var(--amber)]">
                              <Users className="w-3 h-3" />
                              <span>Pendiente asignar abogado</span>
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2" title={stageDescription(c.stage)}>
                        {isHardLocked ? (
                          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-sm" style={{ background: "var(--red-dim)", color: "var(--red)", border: "1px solid var(--red-border)" }}>
                            Mora 3+ · Bloqueado
                          </span>
                        ) : c.stage === CaseStage.WAITING_CUOTAS ? (
                          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-sm" style={{ background: "rgba(217, 119, 6, 0.10)", color: "#B45309", border: "1px solid rgba(217, 119, 6, 0.32)" }}>
                            Esperando Pago Inicial
                          </span>
                        ) : !c.is_paid ? (
                          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-sm" style={{ background: "var(--red-dim)", color: "var(--red)", border: "1px solid var(--red-border)" }}>
                            Deuda Pendiente
                          </span>
                        ) : c.stage === CaseStage.IN_PROGRESS ? (
                          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-sm" style={{ background: "rgba(37, 99, 235, 0.10)", color: "#1D4ED8", border: "1px solid rgba(37, 99, 235, 0.32)" }}>
                            En Proceso
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-sm" style={{ background: "var(--green-dim)", color: "var(--green)", border: "1px solid var(--green-border)" }}>
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
