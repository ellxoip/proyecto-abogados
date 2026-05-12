import { CaseStage } from "@prisma/client";
import { differenceInCalendarDays } from "date-fns";

export type SlaResult = {
  status: "CUMPLIDO" | "EN_RIESGO" | "INCUMPLIDO" | "SIN_SLA";
  elapsedDays: number;
  remainingDays: number;
  totalDays: number;
  percentUsed: number;
};

type CaseForSla = {
  createdAt: Date;
  stage: CaseStage;
  halted_at: Date | null;
  resolvedAt: Date | null;
};

export function computeSlaStatus(kase: CaseForSla, maxDays: number): SlaResult {
  const now = new Date();

  // SLA clock stops when case is finished or halted
  let effectiveEnd: Date;
  if (kase.stage === CaseStage.FINISHED && kase.resolvedAt) {
    effectiveEnd = kase.resolvedAt;
  } else if (
    (kase.stage === CaseStage.HALTED_BY_PAYMENT || kase.stage === CaseStage.WAITING_CUOTAS) &&
    kase.halted_at
  ) {
    effectiveEnd = kase.halted_at;
  } else {
    effectiveEnd = now;
  }

  const elapsedDays = Math.max(0, differenceInCalendarDays(effectiveEnd, kase.createdAt));
  const remainingDays = Math.max(0, maxDays - elapsedDays);
  const percentUsed = Math.min(100, (elapsedDays / maxDays) * 100);

  let status: SlaResult["status"];
  if (elapsedDays > maxDays) {
    status = "INCUMPLIDO";
  } else if (remainingDays / maxDays < 0.2) {
    status = "EN_RIESGO";
  } else {
    status = "CUMPLIDO";
  }

  return { status, elapsedDays, remainingDays, totalDays: maxDays, percentUsed };
}

export function slaStatusLabel(status: SlaResult["status"]): string {
  const map: Record<SlaResult["status"], string> = {
    CUMPLIDO: "Dentro del plazo",
    EN_RIESGO: "En riesgo",
    INCUMPLIDO: "Vencido",
    SIN_SLA: "Sin SLA definido",
  };
  return map[status];
}

export function slaStatusColor(status: SlaResult["status"]): string {
  const map: Record<SlaResult["status"], string> = {
    CUMPLIDO: "#4ADE80",
    EN_RIESGO: "#FCD34D",
    INCUMPLIDO: "var(--red)",
    SIN_SLA: "var(--text-muted)",
  };
  return map[status];
}

export function slaStatusBg(status: SlaResult["status"]): string {
  const map: Record<SlaResult["status"], string> = {
    CUMPLIDO: "rgba(34, 197, 94, 0.1)",
    EN_RIESGO: "rgba(245, 158, 11, 0.1)",
    INCUMPLIDO: "rgba(220, 38, 38, 0.1)",
    SIN_SLA: "var(--surface)",
  };
  return map[status];
}
