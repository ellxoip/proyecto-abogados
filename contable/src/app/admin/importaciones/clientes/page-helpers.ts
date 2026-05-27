export type Issue = {
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type PreviewItem = {
  rowNumber: number;
  status: string;
  rut?: string | null;
  clienteRut?: string | null;
  contratoRef?: string | null;
  servicio?: string | null;
  montoTotal?: number | null;
  cantidadCuotas?: number | null;
  numeroCuota?: number | null;
  monto?: number | null;
  fechaVencimiento?: string | null;
  estadoCuota?: string | null;
  rawData?: Record<string, unknown>;
  normalizedData?: Record<string, unknown> | null;
  issues: Issue[];
};

export type PreviewResponse = {
  ok: true;
  batchId: number;
  summary: {
    totalClients: number;
    readyClients: number;
    reviewClients?: number;
    errorClients: number;
    totalContracts: number;
    readyContracts: number;
    reviewContracts?: number;
    errorContracts: number;
    totalInstallments: number;
    readyInstallments: number;
    skippedInstallments: number;
    reviewInstallments: number;
    errorInstallments: number;
    blockedRecords: number;
    warningsImportablesTotal: number;
  };
  preview: {
    clients: PreviewItem[];
    contracts: PreviewItem[];
    installments: PreviewItem[];
  };
};

type EntityType = "CLIENTE" | "CONTRATO" | "CUOTA";
type SheetName = "CLIENTES" | "CONTRATOS" | "CUOTAS_OPCIONAL";

export type FlattenedRow = {
  entity: EntityType;
  sheet: SheetName;
  rowNumber: number;
  reference: string;
  status: string;
  issues: Issue[];
  rawData: Record<string, unknown> | null;
  normalizedData: Record<string, unknown> | null;
};

export type ProblemRow = {
  type: "ERROR" | "WARNING" | "REVIEW";
  entity: EntityType;
  sheet: SheetName;
  rowNumber: number;
  reference: string;
  status: string;
  code: string;
  message: string;
  suggestedAction: string;
  rawData: Record<string, unknown> | null;
  normalizedData: Record<string, unknown> | null;
};

const PROBLEM_STATUSES = new Set(["REVIEW", "ERROR", "SKIPPED"]);

function resolveReference(item: PreviewItem): string {
  return item.rut ?? item.clienteRut ?? item.contratoRef ?? "-";
}

function makeFlattenedRows(preview: PreviewResponse): FlattenedRow[] {
  const clients = preview.preview.clients.map((item) => ({
    entity: "CLIENTE" as const,
    sheet: "CLIENTES" as const,
    rowNumber: item.rowNumber,
    reference: resolveReference(item),
    status: item.status,
    issues: item.issues,
    rawData: item.rawData ?? null,
    normalizedData: item.normalizedData ?? null,
  }));
  const contracts = preview.preview.contracts.map((item) => ({
    entity: "CONTRATO" as const,
    sheet: "CONTRATOS" as const,
    rowNumber: item.rowNumber,
    reference: item.contratoRef ?? item.clienteRut ?? resolveReference(item),
    status: item.status,
    issues: item.issues,
    rawData: item.rawData ?? null,
    normalizedData: item.normalizedData ?? null,
  }));
  const installments = preview.preview.installments.map((item) => ({
    entity: "CUOTA" as const,
    sheet: "CUOTAS_OPCIONAL" as const,
    rowNumber: item.rowNumber,
    reference: item.contratoRef ?? resolveReference(item),
    status: item.status,
    issues: item.issues,
    rawData: item.rawData ?? null,
    normalizedData: item.normalizedData ?? null,
  }));

  return [...clients, ...contracts, ...installments];
}

export function buildConfirmPayload(onlyReady: boolean) {
  return {
    onlyReady,
    allowReview: !onlyReady,
  };
}

export function isStatusImportable(status: string, onlyReady: boolean) {
  if (onlyReady) return status === "READY";
  return status === "READY" || status === "REVIEW";
}

export function countImportables(preview: PreviewResponse, onlyReady: boolean) {
  const rows = makeFlattenedRows(preview);
  return rows.filter((row) => isStatusImportable(row.status, onlyReady)).length;
}

export function canConfirmImport(preview: PreviewResponse | null, onlyReady: boolean) {
  if (!preview) return false;
  return countImportables(preview, onlyReady) > 0;
}

export function buildReadyRows(preview: PreviewResponse) {
  return makeFlattenedRows(preview).filter((row) => row.status === "READY");
}

export function buildProblemRows(preview: PreviewResponse): ProblemRow[] {
  const rows = makeFlattenedRows(preview);
  const result: ProblemRow[] = [];

  for (const row of rows) {
    const hasIssues = row.issues.length > 0;
    const isProblemStatus = PROBLEM_STATUSES.has(row.status);
    if (!hasIssues && !isProblemStatus) continue;

    if (!hasIssues) {
      result.push({
        type: row.status === "REVIEW" ? "REVIEW" : "WARNING",
        entity: row.entity,
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        reference: row.reference,
        status: row.status,
        code: `STATUS_${row.status}`,
        message: `Registro con estado ${row.status}.`,
        suggestedAction: "Revisar registro en Excel y volver a importar.",
        rawData: row.rawData,
        normalizedData: row.normalizedData,
      });
      continue;
    }

    for (const issue of row.issues) {
      result.push({
        type:
          issue.severity === "error"
            ? "ERROR"
            : row.status === "REVIEW"
              ? "REVIEW"
              : "WARNING",
        entity: row.entity,
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        reference: row.reference,
        status: row.status,
        code: issue.code,
        message: issue.message,
        suggestedAction: getSuggestedAction(issue.code, row.sheet),
        rawData: row.rawData,
        normalizedData: row.normalizedData,
      });
    }
  }

  return result;
}

export function getSuggestedAction(issueCode: string, sheet: SheetName) {
  if (issueCode.includes("RUT")) return "Corregir RUT en hoja CLIENTES.";
  if (issueCode.includes("INSTALLMENTS_AMOUNT_MISMATCH")) {
    return "Revisar suma de cuotas vs monto_total en hojas CONTRATOS/CUOTAS_OPCIONAL.";
  }
  if (issueCode.includes("INSTALLMENTS_COUNT_MISMATCH")) {
    return "Revisar cantidad_cuotas en hoja CONTRATOS.";
  }
  if (issueCode.includes("INVALID_INSTALLMENT_AMOUNT")) {
    return "Completar monto de cuota en hoja CUOTAS_OPCIONAL.";
  }
  if (issueCode.includes("SOURCE_BALANCE") || issueCode.includes("SALDO")) {
    return "Corregir saldo_origen en hoja CUOTAS_OPCIONAL.";
  }
  if (sheet === "CLIENTES") return "Corregir fila en hoja CLIENTES.";
  if (sheet === "CONTRATOS") return "Corregir fila en hoja CONTRATOS.";
  return "Corregir fila en hoja CUOTAS_OPCIONAL.";
}

