import {
  EstadoCliente,
  EstadoContrato,
  EstadoCuota,
  EstadoPago,
  ExternalEntityType,
  ImportBatchStatus,
  Prisma,
  PrismaClient,
  TipoCliente,
} from "@prisma/client";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { ExternalReferenceService } from "@/server/services/integrations/external-reference.service";
import { EXTERNAL_SYSTEM_CODES } from "@/server/services/integrations/integration.constants";

type DbWithTransaction = PrismaClient | typeof prisma;
type DbClient = DbWithTransaction | Prisma.TransactionClient;

type ImportSeverity = "error" | "warning";
type ImportStatus = "READY" | "REVIEW" | "SKIPPED" | "ERROR";

type ImportIssue = {
  code: string;
  message: string;
  severity: ImportSeverity;
};

type ContactPayload = {
  nombre: string;
  email: string | null;
  telefono: string | null;
  cargo: string | null;
  esPrincipal: boolean;
  recibeNotificaciones: boolean;
  recibeComprobantes: boolean;
  whatsapp: boolean;
};

type BillingPayload = {
  rutFacturacion: string;
  razonSocial: string;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
  region: string | null;
  email: string | null;
  tipoDocumento: string | null;
  requiereOc: boolean;
  condicionPago: string | null;
};

type NormalizedClient = {
  clientInternalId: string | null;
  rut: string;
  nombreRazonSocial: string;
  tipoCliente: TipoCliente;
  estadoCliente: EstadoCliente;
  fechaIngreso: string;
  contactoPrincipal: ContactPayload | null;
  facturacion: BillingPayload | null;
  enablePagacuotas: boolean;
};

type NormalizedContract = {
  externalContractId: string | null;
  clienteRut: string;
  servicio: string;
  area: string | null;
  montoTotal: number;
  cantidadCuotas: number;
  fechaInicio: string;
  estadoContrato: EstadoContrato;
  observaciones: string | null;
};

type NormalizedInstallment = {
  contratoRef: string;
  contractRowNumber: number | null;
  contractExternalId: string | null;
  clientRut: string | null;
  numeroCuota: number;
  monto: number;
  fechaVencimiento: string | null;
  estadoCuota: EstadoCuota;
  cobrable: boolean;
  motivoNoCobrable: string | null;
  fechaPago: string | null;
  medioPago: string | null;
  paymentIdExterno: string | null;
  comprobanteUrl: string | null;
  tipoCuotaOrigen: string | null;
  saldoOrigen: number | null;
  pagadoOrigen: boolean | null;
};

type PreviewClientItem = {
  rowNumber: number;
  rut: string | null;
  nombreRazonSocial: string | null;
  tipoPersona: string | null;
  estadoCliente: string | null;
  fechaIngreso: Date | null;
  rawData: Record<string, unknown>;
  normalizedData: NormalizedClient | null;
  status: ImportStatus;
  issues: ImportIssue[];
};

type PreviewContractItem = {
  rowNumber: number;
  clienteRut: string | null;
  servicio: string | null;
  area: string | null;
  montoTotal: number | null;
  cantidadCuotas: number | null;
  fechaInicio: Date | null;
  estadoContrato: string | null;
  rawData: Record<string, unknown>;
  normalizedData: NormalizedContract | null;
  status: ImportStatus;
  issues: ImportIssue[];
};

type PreviewInstallmentItem = {
  rowNumber: number;
  contratoRef: string | null;
  numeroCuota: number | null;
  monto: number | null;
  fechaVencimiento: Date | null;
  estadoCuota: string | null;
  rawData: Record<string, unknown>;
  normalizedData: NormalizedInstallment | null;
  status: ImportStatus;
  issues: ImportIssue[];
};

type WorkbookRows = {
  clients: SheetRow[];
  contacts: SheetRow[];
  billing: SheetRow[];
  contracts: SheetRow[];
  installments: SheetRow[];
};

type SheetRow = {
  rowNumber: number;
  data: Record<string, unknown>;
  headerByKey: Record<string, string>;
};

type PreviewBuildResult = {
  clients: PreviewClientItem[];
  contracts: PreviewContractItem[];
  installments: PreviewInstallmentItem[];
};

type ConfirmImportOptions = {
  onlyReady?: boolean;
  allowReview?: boolean;
};

type ConfirmImportPolicy = {
  onlyReady: boolean;
  allowReview: boolean;
  importableStatuses: Set<ImportStatus>;
};

const SHEETS = {
  CLIENTES: "CLIENTES",
  CONTACTOS: "CONTACTOS",
  FACTURACION: "FACTURACION",
  CONTRATOS: "CONTRATOS",
  CUOTAS: "CUOTAS_OPCIONAL",
} as const;
const CONTRACT_INSTALLMENTS_AMOUNT_TOLERANCE = 10;

const HEADER_ALIAS_MAP: Record<string, string> = {
  cliente_id_interno_o_rut: "cliente_ref",
  contrato_id_o_cliente_id_rut: "contrato_ref",
};

function normalizeHeader(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\*/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, "_")
    .replace(/[\/]+/g, "_")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return HEADER_ALIAS_MAP[normalized] ?? normalized;
}

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value).trim();
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function normalizeMaybe(value: unknown): string | null {
  const text = normalizeText(value);
  return text.length === 0 ? null : text;
}

function toBoolSiNo(value: unknown) {
  const text = normalizeText(value)
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  return text === "SI" || text === "TRUE" || text === "1";
}

function parseLogicalBoolean(value: unknown): boolean | null {
  const text = normalizeText(value)
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  if (!text) return null;
  if (["SI", "TRUE", "1", "YES"].includes(text)) return true;
  if (["NO", "FALSE", "0"].includes(text)) return false;
  return null;
}

function pickValue(row: Record<string, unknown>, aliases: string[]): unknown {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return row[key];
    }
  }

  return undefined;
}

function pickValueWithMeta(row: SheetRow, aliases: string[]) {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (Object.prototype.hasOwnProperty.call(row.data, key)) {
      return {
        value: row.data[key],
        headerDetected: row.headerByKey[key] ?? key,
        keyDetected: key,
      };
    }
  }

  return {
    value: undefined as unknown,
    headerDetected: null as string | null,
    keyDetected: null as string | null,
  };
}

function normalizeRutRaw(value: unknown) {
  const text = normalizeText(value).toUpperCase().replace(/\./g, "").replace(/\s+/g, "");
  if (!text) return null;

  const cleaned = text.includes("-")
    ? text
    : `${text.slice(0, -1)}-${text.slice(-1)}`;
  const [bodyRaw, dvRaw] = cleaned.split("-");

  if (!bodyRaw || !dvRaw) return null;

  const body = bodyRaw.replace(/\D/g, "");
  const dv = dvRaw.replace(/[^0-9K]/g, "");

  if (!body || !dv) return null;
  return `${body}-${dv}`;
}

export function isValidRut(value: unknown) {
  const normalized = normalizeRutRaw(value);
  if (!normalized) return false;

  const [bodyRaw, dvRaw] = normalized.split("-");
  const body = bodyRaw.replace(/\D/g, "");
  const dv = dvRaw.toUpperCase();

  let sum = 0;
  let multiplier = 2;

  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const expected = 11 - (sum % 11);
  let expectedDv = "0";
  if (expected === 10) expectedDv = "K";
  if (expected === 11) expectedDv = "0";
  if (expected < 10) expectedDv = String(expected);

  return dv === expectedDv;
}

function normalizeRut(value: unknown): string | null {
  if (!isValidRut(value)) return null;
  return normalizeRutRaw(value);
}

export function parseDateValue(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d);
  }

  const text = normalizeText(value);
  if (!text) return null;

  const ddmmyyyy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const day = Number(ddmmyyyy[1]);
    const month = Number(ddmmyyyy[2]);
    const year = Number(ddmmyyyy[3]);
    return new Date(year, month - 1, day);
  }

  const iso = new Date(text);
  if (!Number.isNaN(iso.getTime())) {
    return new Date(iso.getFullYear(), iso.getMonth(), iso.getDate());
  }

  return null;
}

function parseNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const raw = normalizeText(value);
  if (!raw) return null;

  const cleaned = raw
    .replace(/clp/gi, "")
    .replace(/\$/g, "")
    .replace(/\s+/g, "")
    .replace(/[^\d,.-]/g, "");

  if (!cleaned) return null;

  const hasDot = cleaned.includes(".");
  const hasComma = cleaned.includes(",");
  let normalized = cleaned;

  if (hasDot && hasComma) {
    const lastDot = cleaned.lastIndexOf(".");
    const lastComma = cleaned.lastIndexOf(",");
    const decimalSeparator = lastDot > lastComma ? "." : ",";
    if (decimalSeparator === ".") {
      normalized = cleaned.replace(/,/g, "");
    } else {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    }
  } else if (hasComma) {
    const parts = cleaned.split(",");
    const decimals = parts[parts.length - 1];
    normalized =
      parts.length === 2 && decimals.length <= 2
        ? cleaned.replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (hasDot) {
    const parts = cleaned.split(".");
    const decimals = parts[parts.length - 1];
    normalized =
      parts.length === 2 && decimals.length <= 2
        ? cleaned
        : cleaned.replace(/\./g, "");
  }

  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function formatRawValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function normalizeLooseToken(value: unknown): string {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s_-]+/g, "");
}

function isContraResultadoState(value: unknown) {
  return ["contraresultado", "resultado"].includes(normalizeLooseToken(value));
}

function isNonCollectibleState(value: unknown) {
  const token = normalizeLooseToken(value);
  return [
    "contraresultado",
    "resultado",
    "incobrable",
    "nocobrable",
    "nocobrableinformativo",
  ].includes(token);
}

function mapTipoCliente(value: unknown): TipoCliente | null {
  const text = normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s_-]+/g, "");
  if (!text) return null;

  if (["natural", "personanatural", "pn"].includes(text)) {
    return TipoCliente.PERSONA;
  }

  if (
    [
      "juridica",
      "personajuridica",
      "pj",
      "empresa",
      "sociedad",
      "mixta",
    ].includes(text)
  ) {
    return TipoCliente.EMPRESA;
  }

  return null;
}

function inferTipoClienteFromRut(rut: string | null): TipoCliente | null {
  if (!rut) return null;
  const [bodyRaw] = rut.split("-");
  const body = Number(bodyRaw.replace(/\D/g, ""));
  if (!Number.isFinite(body)) return null;
  return body >= 50000000 ? TipoCliente.EMPRESA : TipoCliente.PERSONA;
}

function mapEstadoCliente(value: unknown): EstadoCliente | null {
  const text = normalizeText(value).toLowerCase();
  if (!text) return null;
  if (text === "activo") return EstadoCliente.ACTIVO;
  if (text === "al dia" || text === "al dÃ­a") return EstadoCliente.AL_DIA;
  if (text === "moroso") return EstadoCliente.MOROSO;
  if (text === "finalizado") return EstadoCliente.FINALIZADO;
  if (text === "anulado" || text === "inactivo") return EstadoCliente.ANULADO;
  return null;
}

function mapEstadoContrato(value: unknown): { value: EstadoContrato; warning?: ImportIssue } | null {
  const text = normalizeText(value).toLowerCase();
  if (!text) return null;
  if (text === "activo") return { value: EstadoContrato.ACTIVO };
  if (text === "pagado") return { value: EstadoContrato.PAGADO };
  if (text === "en mora" || text === "moroso") return { value: EstadoContrato.EN_MORA };
  if (text === "repactado") return { value: EstadoContrato.REPACTADO };
  if (text === "terminado" || text === "finalizado") return { value: EstadoContrato.TERMINADO };
  if (text === "anulado") return { value: EstadoContrato.ANULADO };
  if (text === "pendiente") {
    return {
      value: EstadoContrato.ACTIVO,
      warning: {
        code: "CONTRACT_STATUS_DEFAULTED",
        message: "Estado de contrato 'Pendiente' se normalizÃ³ a ACTIVO.",
        severity: "warning",
      },
    };
  }
  return null;
}

function mapEstadoCuota(value: unknown): { value: EstadoCuota; warning?: ImportIssue } {
  const text = normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s_-]+/g, "");
  if (
    [
      "pendiente",
      "porpagar",
      "impaga",
      "nopagada",
      "deuda",
      "debe",
      "vencidapendiente",
    ].includes(text)
  ) {
    return { value: EstadoCuota.PENDIENTE };
  }
  if (
    [
      "pagada",
      "pagado",
      "pago",
      "cancelada",
      "cancelado",
      "abonada",
      "abonado",
    ].includes(text)
  ) {
    return { value: EstadoCuota.PAGADA };
  }
  if (
    [
      "vencida",
      "vencido",
      "mora",
      "morosa",
      "moroso",
      "atrasada",
      "atrasado",
      "incobrable",
    ].includes(text)
  ) {
    return { value: EstadoCuota.VENCIDA };
  }
  if (text === "parcial") return { value: EstadoCuota.PARCIAL };
  if (text === "reprogramada") return { value: EstadoCuota.REPROGRAMADA };
  if (text === "reemplazada") return { value: EstadoCuota.REEMPLAZADA };
  if (text === "anulada" || text === "anulado" || text === "nula" || text === "nulo") {
    return { value: EstadoCuota.ANULADA };
  }
  if (text === "condonada") return { value: EstadoCuota.CONDONADA };
  if (["contraresultado", "resultado"].includes(text)) {
    return {
      value: EstadoCuota.PENDIENTE,
      warning: {
        code: "INSTALLMENT_STATUS_DEFAULTED",
        message: "Estado de cuota 'contra resultado' se normalizo a PENDIENTE.",
        severity: "warning",
      },
    };
  }

  return {
    value: EstadoCuota.PENDIENTE,
    warning: {
      code: "INSTALLMENT_STATUS_DEFAULTED",
      message: "Estado de cuota no reconocido; se normalizo a PENDIENTE.",
      severity: "warning",
    },
  };
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function asImportStatus(issues: ImportIssue[]): ImportStatus {
  const hasError = issues.some((issue) => issue.severity === "error");
  if (hasError) return "ERROR";
  const hasWarning = issues.some((issue) => issue.severity === "warning");
  return hasWarning ? "REVIEW" : "READY";
}

function extractRows(workbook: XLSX.WorkBook, sheetName: string): SheetRow[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`La hoja ${sheetName} no existe en el archivo.`);
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  if (matrix.length === 0) return [];

  const originalHeaders = (matrix[0] ?? []).map((value) => normalizeText(value));
  const normalizedHeaders = originalHeaders.map((value, index) =>
    normalizeHeader(value || `col_${index + 1}`),
  );

  const rows: SheetRow[] = [];

  for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
    const sourceRow = matrix[rowIndex] ?? [];
    const data: Record<string, unknown> = {};
    const headerByKey: Record<string, string> = {};
    let hasValue = false;

    for (let colIndex = 0; colIndex < normalizedHeaders.length; colIndex += 1) {
      const key = normalizedHeaders[colIndex];
      if (!key) continue;
      const cellValue = sourceRow[colIndex];
      data[key] = cellValue;
      headerByKey[key] = originalHeaders[colIndex] || key;
      if (cellValue !== null && cellValue !== undefined && normalizeText(cellValue) !== "") {
        hasValue = true;
      }
    }

    if (!hasValue) continue;
    rows.push({
      rowNumber: rowIndex + 1,
      data,
      headerByKey,
    });
  }

  return rows;
}

function refKeys(value: unknown): string[] {
  const text = normalizeText(value);
  if (!text) return [];

  const rut = normalizeRut(text);
  const keys: string[] = [];
  if (rut) keys.push(`rut:${rut}`);
  keys.push(`id:${text.toUpperCase()}`);
  return keys;
}

function selectPrimaryContact(contacts: ContactPayload[]): ContactPayload | null {
  if (contacts.length === 0) return null;
  const primary = contacts.find((item) => item.esPrincipal);
  return primary ?? contacts[0];
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setMonth(result.getMonth() + months);
  return result;
}

function formatIssueCurrency(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

function appendIssueOnce(target: ImportIssue[], issue: ImportIssue) {
  if (target.some((item) => item.code === issue.code && item.message === issue.message)) {
    return;
  }
  target.push(issue);
}

function hasExplicitValue(value: unknown) {
  if (value === null || value === undefined) return false;
  return normalizeText(value).length > 0;
}

type HistoricalPaymentDetection = {
  hasHistoricalPayment: boolean;
  paymentAmount: number;
  paymentDate: Date | null;
  paymentDateWasInferred: boolean;
  medioPago: string | null;
  paymentEventId: string | null;
  referencia: string | null;
  comprobanteUrl: string | null;
  observacion: string | null;
  targetInstallmentStatus: EstadoCuota;
  saldoPendiente: number;
};

function detectHistoricalPayment(params: {
  installment: NormalizedInstallment;
  importDate: Date;
  fallbackDueDate: Date | null;
}): HistoricalPaymentDetection {
  const { installment, importDate, fallbackDueDate } = params;
  const montoActual = installment.monto;
  const saldoOrigen = installment.saldoOrigen;
  const hasPartialBySaldo =
    saldoOrigen !== null && saldoOrigen > 0 && saldoOrigen < montoActual;
  const hasPaidBySaldo = saldoOrigen !== null && saldoOrigen === 0;
  const hasPaymentSignal =
    installment.estadoCuota === EstadoCuota.PAGADA ||
    installment.pagadoOrigen === true ||
    installment.fechaPago !== null ||
    hasPartialBySaldo ||
    hasPaidBySaldo;

  if (!hasPaymentSignal) {
    return {
      hasHistoricalPayment: false,
      paymentAmount: 0,
      paymentDate: null,
      paymentDateWasInferred: false,
      medioPago: null,
      paymentEventId: installment.paymentIdExterno,
      referencia: null,
      comprobanteUrl: installment.comprobanteUrl,
      observacion: null,
      targetInstallmentStatus: installment.estadoCuota,
      saldoPendiente: Math.max(montoActual, 0),
    };
  }

  const isTotalPaid =
    installment.estadoCuota === EstadoCuota.PAGADA ||
    (installment.pagadoOrigen === true && saldoOrigen === 0) ||
    saldoOrigen === 0;

  let paymentAmount = 0;
  let saldoPendiente = montoActual;
  let targetInstallmentStatus = installment.estadoCuota;

  if (hasPartialBySaldo && saldoOrigen !== null) {
    paymentAmount = Math.max(montoActual - saldoOrigen, 0);
    saldoPendiente = Math.max(saldoOrigen, 0);
    targetInstallmentStatus = EstadoCuota.PARCIAL;
  } else if (isTotalPaid) {
    paymentAmount = montoActual;
    saldoPendiente = 0;
    targetInstallmentStatus = EstadoCuota.PAGADA;
  } else {
    paymentAmount = montoActual;
    saldoPendiente = 0;
    targetInstallmentStatus = EstadoCuota.PAGADA;
  }

  const explicitDate = installment.fechaPago ? new Date(installment.fechaPago) : null;
  const paymentDate = explicitDate ?? fallbackDueDate ?? importDate;
  const paymentDateWasInferred = explicitDate === null;
  const inferredFromDueDate = explicitDate === null && fallbackDueDate !== null;
  const medioPago =
    installment.medioPago && installment.medioPago.trim().length > 0
      ? installment.medioPago.trim()
      : "MIGRACION";

  const observations = ["Pago historico migrado desde CUOTAS_OPCIONAL"];
  if (inferredFromDueDate) {
    observations.push(
      "Pago historico migrado sin fecha exacta; se uso fecha de vencimiento como referencia",
    );
  } else if (paymentDateWasInferred) {
    observations.push(
      "Pago historico migrado sin fecha exacta; se uso fecha de importacion como referencia",
    );
  }
  if (!installment.medioPago || installment.medioPago.trim().length === 0) {
    observations.push("Pago historico migrado sin medio de pago informado");
  }
  if (hasPartialBySaldo) {
    observations.push("Pago parcial historico calculado desde saldo_origen");
  }
  if (installment.tipoCuotaOrigen) {
    observations.push(`Tipo cuota origen: ${installment.tipoCuotaOrigen}`);
  }

  return {
    hasHistoricalPayment: true,
    paymentAmount: Math.max(paymentAmount, 0),
    paymentDate,
    paymentDateWasInferred,
    medioPago,
    paymentEventId: installment.paymentIdExterno,
    referencia: null,
    comprobanteUrl: installment.comprobanteUrl,
    observacion: observations.join(" | "),
    targetInstallmentStatus,
    saldoPendiente: Math.max(saldoPendiente, 0),
  };
}

function buildStableMigrationReference(params: {
  contractExternalId: string | null;
  contractId: number;
  installmentNumber: number;
  paymentAmount: number;
  paymentDate: Date;
}) {
  const contractRef = params.contractExternalId || String(params.contractId);
  return `MIGRACION_CLIENTES:${contractRef}:${params.installmentNumber}:${params.paymentAmount.toFixed(2)}:${toIsoDate(params.paymentDate)}`;
}

function installmentStatusFromBalance(
  saldoPendiente: number,
  montoActual: number,
): EstadoCuota {
  if (saldoPendiente <= 0) return EstadoCuota.PAGADA;
  if (saldoPendiente < montoActual) return EstadoCuota.PARCIAL;
  return EstadoCuota.PENDIENTE;
}

async function findExistingContracts(
  db: DbClient,
  contracts: PreviewContractItem[],
  existingClientsByRut: Map<string, number>,
) {
  const map = new Set<number>();

  await Promise.all(
    contracts.map(async (item) => {
      if (!item.normalizedData) return;

      const clientId = existingClientsByRut.get(item.normalizedData.clienteRut);
      if (!clientId) return;

      const found = await db.contrato.findFirst({
        where: {
          cliente_id: clientId,
          tipo_servicio: item.normalizedData.servicio,
          monto_ccto: item.normalizedData.montoTotal,
          fecha_contrato: new Date(item.normalizedData.fechaInicio),
        },
        select: { id: true },
      });

      if (found) map.add(item.rowNumber);
    }),
  );

  return map;
}

export function buildPreviewFromRows(
  rows: WorkbookRows,
  existingClientRuts: Set<string>,
): PreviewBuildResult {
  const contactsByRef = new Map<string, ContactPayload[]>();
  const billingByRef = new Map<string, BillingPayload>();

  for (const row of rows.contacts) {
    const ref = pickValue(row.data, ["cliente_id_interno o rut", "cliente_id_interno o rut *"]);
    const keys = refKeys(ref);
    if (keys.length === 0) continue;

    const payload: ContactPayload = {
      nombre: normalizeText(pickValue(row.data, ["nombre_contacto", "nombre_contacto *"])),
      email: normalizeMaybe(pickValue(row.data, ["email"])),
      telefono: normalizeMaybe(pickValue(row.data, ["telefono"])),
      cargo: normalizeMaybe(pickValue(row.data, ["cargo"])),
      esPrincipal: toBoolSiNo(pickValue(row.data, ["es_contacto_principal", "es_contacto_principal *"])),
      recibeNotificaciones: toBoolSiNo(pickValue(row.data, ["recibe_notificaciones", "recibe_notificaciones *"])),
      recibeComprobantes: toBoolSiNo(pickValue(row.data, ["recibe_comprobantes", "recibe_comprobantes *"])),
      whatsapp: toBoolSiNo(pickValue(row.data, ["whatsapp"])),
    };

    for (const key of keys) {
      const current = contactsByRef.get(key) ?? [];
      current.push(payload);
      contactsByRef.set(key, current);
    }
  }

  for (const row of rows.billing) {
    const ref = pickValue(row.data, ["cliente_id_interno o rut", "cliente_id_interno o rut *"]);
    const keys = refKeys(ref);
    if (keys.length === 0) continue;

    const rutFacturacion = normalizeRut(pickValue(row.data, ["rut_facturacion", "rut_facturacion *"]));
    const razonSocial = normalizeMaybe(
      pickValue(row.data, ["razon_social_facturacion", "razon_social_facturacion *"]),
    );

    if (!rutFacturacion || !razonSocial) continue;

    const payload: BillingPayload = {
      rutFacturacion,
      razonSocial,
      giro: normalizeMaybe(pickValue(row.data, ["giro_facturacion"])),
      direccion: normalizeMaybe(pickValue(row.data, ["direccion_facturacion"])),
      comuna: normalizeMaybe(pickValue(row.data, ["comuna"])),
      ciudad: normalizeMaybe(pickValue(row.data, ["ciudad"])),
      region: normalizeMaybe(pickValue(row.data, ["region"])),
      email: normalizeMaybe(pickValue(row.data, ["email_facturacion"])),
      tipoDocumento: normalizeMaybe(pickValue(row.data, ["tipo_documento_preferido"])),
      requiereOc: toBoolSiNo(pickValue(row.data, ["requiere_oc"])),
      condicionPago: normalizeMaybe(pickValue(row.data, ["condicion_pago"])),
    };

    for (const key of keys) {
      billingByRef.set(key, payload);
    }
  }

  const clients: PreviewClientItem[] = [];
  const internalIdToRut = new Map<string, string>();
  const rutCounter = new Map<string, number>();

  for (const row of rows.clients) {
    const issues: ImportIssue[] = [];
    const rut = normalizeRut(pickValue(row.data, ["rut", "rut *"]));
    const nombre = normalizeMaybe(pickValue(row.data, ["nombre_razon_social", "nombre_razon_social *"]));
    const tipoPersona = normalizeMaybe(pickValue(row.data, ["tipo_persona", "tipo_persona *"]));
    const estadoClienteText = normalizeMaybe(pickValue(row.data, ["estado_cliente", "estado_cliente *"]));
    const fechaIngreso = parseDateValue(pickValue(row.data, ["fecha_ingreso", "fecha_ingreso *"]));
    const internalId = normalizeMaybe(pickValue(row.data, ["cliente_id_interno", "cliente_id_interno (opcional)"]));

    if (!rut) {
      issues.push({
        code: "INVALID_RUT",
        message: "Cliente debe tener RUT chileno valido.",
        severity: "error",
      });
    }

    if (!nombre) {
      issues.push({
        code: "MISSING_NAME",
        message: "Cliente debe tener nombre o razon social.",
        severity: "error",
      });
    }

    const tipoOriginal = mapTipoCliente(tipoPersona);
    const tipoInferido = tipoOriginal ?? inferTipoClienteFromRut(rut);
    const tipo = tipoInferido;
    if (!tipoOriginal && tipoInferido) {
      issues.push({
        code: "PERSON_TYPE_INFERRED_FROM_RUT",
        message: "Tipo persona inferido desde RUT por valor vacio o no reconocido.",
        severity: "warning",
      });
    }
    if (!tipo) {
      issues.push({
        code: "INVALID_PERSON_TYPE",
        message: "Tipo persona invalido y sin RUT valido para inferencia.",
        severity: "error",
      });
    }

    const estado = mapEstadoCliente(estadoClienteText);
    if (!estado) {
      issues.push({
        code: "INVALID_CLIENT_STATUS",
        message: "Estado cliente invalido o ausente.",
        severity: "error",
      });
    }

    if (!fechaIngreso) {
      issues.push({
        code: "MISSING_ENTRY_DATE",
        message: "Cliente debe tener fecha de ingreso.",
        severity: "error",
      });
    }

    if (rut) {
      rutCounter.set(rut, (rutCounter.get(rut) ?? 0) + 1);
    }

    if (internalId && rut) {
      internalIdToRut.set(internalId.toUpperCase(), rut);
    }

    const candidateKeys = [
      ...(rut ? [`rut:${rut}`] : []),
      ...(internalId ? [`id:${internalId.toUpperCase()}`] : []),
    ];

    const contactCandidates = candidateKeys
      .flatMap((key) => contactsByRef.get(key) ?? []);
    const contactoPrincipal = selectPrimaryContact(contactCandidates);

    const billing = candidateKeys
      .map((key) => billingByRef.get(key))
      .find((value): value is BillingPayload => Boolean(value)) ?? null;

    if (rut && existingClientRuts.has(rut)) {
      issues.push({
        code: "EXISTING_CLIENT",
        message: "Cliente ya existe en base de datos; se actualizara.",
        severity: "warning",
      });
    }

    const normalizedData: NormalizedClient | null =
      rut && nombre && tipo && estado && fechaIngreso
        ? {
            clientInternalId: internalId,
            rut,
            nombreRazonSocial: nombre,
            tipoCliente: tipo,
            estadoCliente: estado,
            fechaIngreso: toIsoDate(fechaIngreso),
            contactoPrincipal,
            facturacion: billing,
            enablePagacuotas: Boolean(
              contactoPrincipal?.whatsapp || contactoPrincipal?.recibeNotificaciones,
            ),
          }
        : null;

    clients.push({
      rowNumber: row.rowNumber,
      rut,
      nombreRazonSocial: nombre,
      tipoPersona,
      estadoCliente: estadoClienteText,
      fechaIngreso,
      rawData: row.data,
      normalizedData,
      status: asImportStatus(issues),
      issues,
    });
  }

  for (const item of clients) {
    if (!item.rut) continue;
    if ((rutCounter.get(item.rut) ?? 0) > 1) {
      item.issues.push({
        code: "DUPLICATE_RUT_IN_FILE",
        message: "RUT duplicado dentro del archivo CLIENTES.",
        severity: "error",
      });
      item.status = asImportStatus(item.issues);
    }
  }

  const contracts: PreviewContractItem[] = [];
  const contractKeyCounter = new Map<string, number>();
  const contractsByExternalId = new Map<string, PreviewContractItem[]>();
  const contractsByClientRut = new Map<string, PreviewContractItem[]>();
  const contractsByAnyExternalId = new Map<string, PreviewContractItem[]>();

  for (const row of rows.contracts) {
    const issues: ImportIssue[] = [];
    const clientRef = pickValue(row.data, ["cliente_ref", "cliente_id_interno o rut", "cliente_id_interno o rut *"]);
    const servicio = normalizeMaybe(pickValue(row.data, ["servicio", "servicio *"]));
    const area = normalizeMaybe(pickValue(row.data, ["area", "area *"]));
    const montoTotalField = pickValueWithMeta(row, ["monto_total", "monto_total *"]);
    const montoTotal = parseNumberValue(montoTotalField.value);
    const cantidadCuotasRaw = parseNumberValue(
      pickValue(row.data, ["cantidad_cuotas", "cantidad_cuotas *"]),
    );
    const fechaInicio = parseDateValue(pickValue(row.data, ["fecha_inicio", "fecha_inicio *"]));
    const estadoContratoRaw = normalizeMaybe(
      pickValue(row.data, ["estado_contrato", "estado_contrato *"]),
    );
    const externalId = normalizeMaybe(
      pickValue(row.data, ["contrato_id", "contrato_id (opcional)"]),
    );
    const observaciones = normalizeMaybe(pickValue(row.data, ["observaciones"]));

    let clienteRut = normalizeRut(clientRef);
    if (!clienteRut) {
      const refText = normalizeMaybe(clientRef);
      if (refText) {
        clienteRut = internalIdToRut.get(refText.toUpperCase()) ?? null;
      }
    }

    if (!clienteRut) {
      issues.push({
        code: "MISSING_CONTRACT_CLIENT",
        message: "Contrato debe tener cliente asociado.",
        severity: "error",
      });
    }

    if (!servicio) {
      issues.push({
        code: "MISSING_SERVICE",
        message: "Contrato debe tener servicio.",
        severity: "error",
      });
    }

    if (!montoTotal || montoTotal <= 0) {
      issues.push({
        code: "INVALID_TOTAL_AMOUNT",
        message: `Contrato debe tener monto_total mayor a 0. header=${montoTotalField.headerDetected ?? "NO_DETECTADO"} rawValue=${formatRawValue(montoTotalField.value)}.`,
        severity: "error",
      });
    }

    const cantidadCuotas = cantidadCuotasRaw ? Math.trunc(cantidadCuotasRaw) : null;
    if (!cantidadCuotas || cantidadCuotas <= 0) {
      issues.push({
        code: "INVALID_INSTALLMENT_COUNT",
        message: "Contrato debe tener cantidad_cuotas mayor a 0.",
        severity: "error",
      });
    }

    if (!fechaInicio) {
      issues.push({
        code: "MISSING_START_DATE",
        message: "Contrato debe tener fecha_inicio.",
        severity: "error",
      });
    }

    const estadoContrato = mapEstadoContrato(estadoContratoRaw);
    if (!estadoContrato) {
      issues.push({
        code: "INVALID_CONTRACT_STATUS",
        message: "Estado de contrato invalido o ausente.",
        severity: "error",
      });
    } else if (estadoContrato.warning) {
      issues.push(estadoContrato.warning);
    }

    if (clienteRut && servicio && montoTotal && fechaInicio) {
      const key = `${clienteRut}|${servicio.toUpperCase()}|${montoTotal.toFixed(2)}|${toIsoDate(fechaInicio)}`;
      contractKeyCounter.set(key, (contractKeyCounter.get(key) ?? 0) + 1);
    }

    const normalizedData: NormalizedContract | null =
      clienteRut && servicio && montoTotal && cantidadCuotas && fechaInicio && estadoContrato
        ? {
            externalContractId: externalId,
            clienteRut,
            servicio,
            area,
            montoTotal,
            cantidadCuotas,
            fechaInicio: toIsoDate(fechaInicio),
            estadoContrato: estadoContrato.value,
            observaciones,
          }
        : null;

    const status = asImportStatus(issues);
    const item: PreviewContractItem = {
      rowNumber: row.rowNumber,
      clienteRut,
      servicio,
      area,
      montoTotal,
      cantidadCuotas,
      fechaInicio,
      estadoContrato: estadoContratoRaw,
      rawData: row.data,
      normalizedData,
      status,
      issues,
    };

    contracts.push(item);

    if (externalId) {
      const key = externalId.trim().toUpperCase();
      const allList = contractsByAnyExternalId.get(key) ?? [];
      allList.push(item);
      contractsByAnyExternalId.set(key, allList);
    }

    if (normalizedData?.externalContractId) {
      const list = contractsByExternalId.get(normalizedData.externalContractId) ?? [];
      list.push(item);
      contractsByExternalId.set(normalizedData.externalContractId, list);
    }

    if (normalizedData?.clienteRut) {
      const list = contractsByClientRut.get(normalizedData.clienteRut) ?? [];
      list.push(item);
      contractsByClientRut.set(normalizedData.clienteRut, list);
    }
  }

  for (const item of contracts) {
    if (!item.normalizedData) continue;
    const key = `${item.normalizedData.clienteRut}|${item.normalizedData.servicio.toUpperCase()}|${item.normalizedData.montoTotal.toFixed(2)}|${item.normalizedData.fechaInicio}`;
    if ((contractKeyCounter.get(key) ?? 0) > 1) {
      item.issues.push({
        code: "DUPLICATE_CONTRACT_IN_FILE",
        message: "Contrato duplicado dentro del archivo.",
        severity: "error",
      });
      item.status = asImportStatus(item.issues);
    }
  }

  const installments: PreviewInstallmentItem[] = [];
  const installmentKeyCounter = new Map<string, number>();

  for (const row of rows.installments) {
    const issues: ImportIssue[] = [];
    const contratoRef = normalizeMaybe(
      pickValue(row.data, ["contrato_ref", "contrato_id o cliente_id/rut", "contrato_id o cliente_id/rut *"]),
    );
    const numeroCuotaRaw = parseNumberValue(pickValue(row.data, ["numero_cuota", "numero_cuota *"]));
    const montoField = pickValueWithMeta(row, ["monto", "monto *"]);
    const monto = parseNumberValue(montoField.value);
    const fechaVencimiento = parseDateValue(
      pickValue(row.data, ["fecha_vencimiento", "fecha_vencimiento *"]),
    );
    const fechaPagoRaw = pickValue(row.data, ["fecha_pago"]);
    const fechaPago = parseDateValue(fechaPagoRaw);
    const medioPago = normalizeMaybe(pickValue(row.data, ["medio_pago"]));
    const paymentIdExterno = normalizeMaybe(
      pickValue(row.data, ["payment_id_externo"]),
    );
    const comprobanteUrl = normalizeMaybe(pickValue(row.data, ["comprobante_url"]));
    const tipoCuotaOrigen = normalizeMaybe(
      pickValue(row.data, ["tipo_cuota_origen"]),
    );
    const saldoOrigen = parseNumberValue(pickValue(row.data, ["saldo_origen"]));
    const pagadoOrigen = parseLogicalBoolean(pickValue(row.data, ["pagado_origen"]));
    const estadoCuotaRaw = normalizeMaybe(pickValue(row.data, ["estado_cuota", "estado_cuota *"]));
    const isContraResultado = isContraResultadoState(estadoCuotaRaw);
    const isNonCollectible = isNonCollectibleState(estadoCuotaRaw);

    if (!contratoRef) {
      issues.push({
        code: "MISSING_CONTRACT_REFERENCE",
        message: "Cuota debe tener referencia de contrato.",
        severity: "error",
      });
    }

    const numeroCuota = numeroCuotaRaw ? Math.trunc(numeroCuotaRaw) : null;
    if (!numeroCuota || numeroCuota <= 0) {
      issues.push({
        code: "INVALID_INSTALLMENT_NUMBER",
        message: "Cuota debe tener numero_cuota.",
        severity: "error",
      });
    }

    if ((!monto || monto <= 0) && !isContraResultado) {
      issues.push({
        code: "INVALID_INSTALLMENT_AMOUNT",
        message: `Cuota debe tener monto mayor a 0. header=${montoField.headerDetected ?? "NO_DETECTADO"} rawValue=${formatRawValue(montoField.value)}.`,
        severity: "error",
      });
    }
    if ((!monto || monto <= 0) && isNonCollectible) {
      issues.push({
        code: "INSTALLMENT_SKIPPED_NO_AMOUNT_NON_COLLECTIBLE",
        message: "Cuota no cobrable sin monto: se omite de la importacion.",
        severity: "warning",
      });
    }
    if (saldoOrigen !== null && saldoOrigen < 0) {
      issues.push({
        code: "INVALID_SOURCE_BALANCE_NEGATIVE",
        message: "saldo_origen no puede ser negativo.",
        severity: "error",
      });
    }
    if (saldoOrigen !== null && monto && saldoOrigen > monto) {
      issues.push({
        code: "INVALID_SOURCE_BALANCE_EXCEEDS_INSTALLMENT",
        message: "saldo_origen no puede ser mayor al monto de la cuota.",
        severity: "error",
      });
    }

    let contractRowNumber: number | null = null;
    let contractExternalId: string | null = null;
    let clientRut: string | null = null;

    if (contratoRef) {
      const contratoRefKey = contratoRef.trim().toUpperCase();
      const byExternalId = contractsByExternalId.get(contratoRef) ?? [];
      const byAnyExternalId = contractsByAnyExternalId.get(contratoRefKey) ?? [];
      if (byExternalId.length === 1) {
        contractRowNumber = byExternalId[0].rowNumber;
        contractExternalId = contratoRef;
        clientRut = byExternalId[0].normalizedData?.clienteRut ?? null;
      } else if (byExternalId.length > 1) {
        issues.push({
          code: "AMBIGUOUS_CONTRACT_REFERENCE",
          message: "Referencia de cuota apunta a multiples contratos en archivo.",
          severity: "error",
        });
      } else if (byAnyExternalId.length === 1) {
        const matched = byAnyExternalId[0];
        contractRowNumber = matched.rowNumber;
        contractExternalId = contratoRef;
        clientRut = matched.normalizedData?.clienteRut ?? null;
        if (!matched.normalizedData) {
          issues.push({
            code: "CONTRACT_HAS_ERRORS",
            message: "Contrato referenciado existe en archivo, pero tiene errores.",
            severity: "warning",
          });
        }
      } else if (byAnyExternalId.length > 1) {
        issues.push({
          code: "AMBIGUOUS_CONTRACT_REFERENCE",
          message: "Referencia de cuota apunta a multiples contratos en archivo.",
          severity: "error",
        });
      } else {
        const refRut = normalizeRut(contratoRef);
        if (refRut) {
          const byClient = contractsByClientRut.get(refRut) ?? [];
          if (byClient.length === 1) {
            contractRowNumber = byClient[0].rowNumber;
            clientRut = refRut;
            contractExternalId = byClient[0].normalizedData?.externalContractId ?? null;
          } else if (byClient.length > 1) {
            issues.push({
              code: "AMBIGUOUS_CLIENT_CONTRACT_REFERENCE",
              message: "Cliente de cuota tiene multiples contratos en archivo.",
              severity: "error",
            });
          }
        }

        if (!contractRowNumber) {
          const mappedRut = internalIdToRut.get(contratoRef.toUpperCase());
          if (mappedRut) {
            const byClient = contractsByClientRut.get(mappedRut) ?? [];
            if (byClient.length === 1) {
              contractRowNumber = byClient[0].rowNumber;
              clientRut = mappedRut;
              contractExternalId = byClient[0].normalizedData?.externalContractId ?? null;
            } else if (byClient.length > 1) {
              issues.push({
                code: "AMBIGUOUS_CLIENT_CONTRACT_REFERENCE",
                message: "Cliente de cuota tiene multiples contratos en archivo.",
                severity: "error",
              });
            }
          }
        }
      }
    }

    const estadoMapped = mapEstadoCuota(estadoCuotaRaw);
    if (estadoMapped.warning) {
      issues.push(estadoMapped.warning);
    }

    const hasHistoricalPaymentSignal =
      estadoMapped.value === EstadoCuota.PAGADA ||
      pagadoOrigen === true ||
      fechaPago !== null ||
      (saldoOrigen !== null && monto !== null && saldoOrigen < monto);
    if (hasHistoricalPaymentSignal && !fechaPago && hasExplicitValue(fechaPagoRaw)) {
      issues.push({
        code: "INVALID_PAYMENT_DATE",
        message: "fecha_pago no pudo ser interpretada; se inferira durante confirmacion.",
        severity: "warning",
      });
    }

    if (!contractRowNumber && !contractExternalId && !clientRut) {
      issues.push({
        code: "UNRESOLVED_CONTRACT_REFERENCE",
        message: "No fue posible relacionar la cuota con un contrato del archivo.",
        severity: "warning",
      });
    }

    const normalizedData: NormalizedInstallment | null =
      contratoRef && numeroCuota && monto && monto > 0
        ? {
            contratoRef,
            contractRowNumber,
            contractExternalId,
            clientRut,
            numeroCuota,
            monto,
            fechaVencimiento: fechaVencimiento ? toIsoDate(fechaVencimiento) : null,
            estadoCuota: estadoMapped.value,
            cobrable: !isContraResultado,
            motivoNoCobrable: isContraResultado ? "CONTRA_RESULTADO" : null,
            fechaPago: fechaPago ? toIsoDate(fechaPago) : null,
            medioPago,
            paymentIdExterno,
            comprobanteUrl,
            tipoCuotaOrigen,
            saldoOrigen,
            pagadoOrigen,
          }
        : null;

    if (normalizedData) {
      const keyRef =
        normalizedData.contractRowNumber !== null
          ? `row:${normalizedData.contractRowNumber}`
          : normalizedData.contractExternalId
            ? `external:${normalizedData.contractExternalId}`
            : normalizedData.clientRut
              ? `rut:${normalizedData.clientRut}`
              : `raw:${normalizedData.contratoRef}`;
      const key = `${keyRef}|${normalizedData.numeroCuota}`;
      installmentKeyCounter.set(key, (installmentKeyCounter.get(key) ?? 0) + 1);
    }

    const hasResolvedContract = Boolean(contractRowNumber || contractExternalId || clientRut);
    const hasCriticalInstallmentData = Boolean(
      hasResolvedContract && contratoRef && numeroCuota && monto && monto > 0,
    );
    let status = asImportStatus(issues);
    if (
      issues.some((issue) => issue.code === "INSTALLMENT_SKIPPED_NO_AMOUNT_NON_COLLECTIBLE")
    ) {
      status = "SKIPPED";
    }
    if (
      status === "REVIEW" &&
      hasCriticalInstallmentData &&
      issues.every((issue) => issue.code === "INSTALLMENT_STATUS_DEFAULTED")
    ) {
      status = "READY";
    }
    if (issues.some((issue) => issue.code === "CONTRACT_HAS_ERRORS")) {
      status = "REVIEW";
    }

    installments.push({
      rowNumber: row.rowNumber,
      contratoRef,
      numeroCuota,
      monto,
      fechaVencimiento,
      estadoCuota: estadoCuotaRaw,
      rawData: row.data,
      normalizedData,
      status,
      issues,
    });
  }

  for (const item of installments) {
    if (!item.normalizedData) continue;
    const keyRef =
      item.normalizedData.contractRowNumber !== null
        ? `row:${item.normalizedData.contractRowNumber}`
        : item.normalizedData.contractExternalId
          ? `external:${item.normalizedData.contractExternalId}`
          : item.normalizedData.clientRut
            ? `rut:${item.normalizedData.clientRut}`
            : `raw:${item.normalizedData.contratoRef}`;
    const key = `${keyRef}|${item.normalizedData.numeroCuota}`;

    if ((installmentKeyCounter.get(key) ?? 0) > 1) {
      item.issues.push({
        code: "DUPLICATE_INSTALLMENT_IN_FILE",
        message: "Cuota duplicada en archivo para el mismo contrato y numero.",
        severity: "error",
      });
      item.status = asImportStatus(item.issues);
    }
  }

  for (const contract of contracts) {
    if (!contract.normalizedData) continue;

    const contractExternalId = contract.normalizedData.externalContractId
      ? contract.normalizedData.externalContractId.trim().toUpperCase()
      : null;

    const relatedInstallments = installments.filter((installment) => {
      const normalizedInstallment = installment.normalizedData;
      if (!normalizedInstallment) return false;
      if (normalizedInstallment.contractRowNumber === contract.rowNumber) return true;
      if (
        contractExternalId &&
        normalizedInstallment.contractExternalId &&
        normalizedInstallment.contractExternalId.trim().toUpperCase() === contractExternalId
      ) {
        return true;
      }
      return false;
    });

    if (relatedInstallments.length === 0) continue;

    const explicitInstallments = relatedInstallments.filter(
      (installment) =>
        installment.status !== "SKIPPED" &&
        installment.normalizedData &&
        installment.normalizedData.monto > 0,
    );
    if (explicitInstallments.length === 0) continue;

    const amountSum = explicitInstallments.reduce(
      (acc, installment) => acc + (installment.normalizedData?.monto ?? 0),
      0,
    );
    const expectedAmount = contract.normalizedData.montoTotal;
    const amountDifference = Math.abs(amountSum - expectedAmount);

    if (amountDifference > CONTRACT_INSTALLMENTS_AMOUNT_TOLERANCE) {
      appendIssueOnce(contract.issues, {
        code: "CONTRACT_INSTALLMENTS_AMOUNT_MISMATCH",
        message: `La suma de cuotas (${formatIssueCurrency(amountSum)}) no coincide con el monto del contrato (${formatIssueCurrency(expectedAmount)}). Diferencia: ${formatIssueCurrency(Math.abs(amountSum - expectedAmount))}.`,
        severity: "error",
      });
    }

    const expectedCount = contract.normalizedData.cantidadCuotas;
    const importedCount = explicitInstallments.length;
    if (importedCount !== expectedCount) {
      appendIssueOnce(contract.issues, {
        code: "CONTRACT_INSTALLMENTS_COUNT_MISMATCH",
        message: `La cantidad de cuotas importadas (${importedCount}) no coincide con cantidad_cuotas del contrato (${expectedCount}).`,
        severity: "error",
      });
    }

    contract.status = asImportStatus(contract.issues);

    const hasFinancialMismatch = contract.issues.some((issue) =>
      [
        "CONTRACT_INSTALLMENTS_AMOUNT_MISMATCH",
        "CONTRACT_INSTALLMENTS_COUNT_MISMATCH",
      ].includes(issue.code),
    );

    if (hasFinancialMismatch) {
      for (const installment of relatedInstallments) {
        appendIssueOnce(installment.issues, {
          code: "CONTRACT_FINANCIAL_VALIDATION_FAILED",
          message:
            "Contrato bloqueado por descuadre entre monto/cantidad de cuotas y datos del contrato.",
          severity: "error",
        });
        installment.status = asImportStatus(installment.issues);
      }
    }
  }

  return {
    clients,
    contracts,
    installments,
  };
}

function itemStatusCount(items: { status: ImportStatus }[]) {
  return {
    ready: items.filter((item) => item.status === "READY").length,
    review: items.filter((item) => item.status === "REVIEW").length,
    skipped: items.filter((item) => item.status === "SKIPPED").length,
    error: items.filter((item) => item.status === "ERROR").length,
  };
}

function toPrismaJson<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parseIssues(value: unknown): ImportIssue[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Partial<ImportIssue>;
      if (!candidate.code || !candidate.message) return null;
      const severity = candidate.severity === "warning" ? "warning" : "error";
      return {
        code: candidate.code,
        message: candidate.message,
        severity,
      } satisfies ImportIssue;
    })
    .filter((item): item is ImportIssue => item !== null);
}

function resolveConfirmImportPolicy(options?: ConfirmImportOptions): ConfirmImportPolicy {
  const onlyReady = options?.onlyReady ?? true;
  const allowReview = onlyReady ? false : (options?.allowReview ?? true);
  const importableStatuses = new Set<ImportStatus>(["READY"]);
  if (!onlyReady && allowReview) {
    importableStatuses.add("REVIEW");
  }

  return {
    onlyReady,
    allowReview,
    importableStatuses,
  };
}

function isStatusImportable(
  status: string,
  policy: ConfirmImportPolicy,
): status is ImportStatus {
  return policy.importableStatuses.has(status as ImportStatus);
}

function batchSummary(result: PreviewBuildResult) {
  const clients = itemStatusCount(result.clients);
  const contracts = itemStatusCount(result.contracts);
  const installments = itemStatusCount(result.installments);
  const warningCount = <T extends { issues: ImportIssue[] }>(items: T[]) =>
    items.reduce(
      (acc, item) => acc + item.issues.filter((issue) => issue.severity === "warning").length,
      0,
    );

  return {
    totalClients: result.clients.length,
    readyClients: clients.ready,
    reviewClients: clients.review,
    errorClients: clients.error,
    clientsReady: clients.ready,
    clientsReview: clients.review,
    clientsError: clients.error,
    totalContracts: result.contracts.length,
    readyContracts: contracts.ready,
    reviewContracts: contracts.review,
    errorContracts: contracts.error,
    contractsReady: contracts.ready,
    contractsReview: contracts.review,
    contractsError: contracts.error,
    totalInstallments: result.installments.length,
    readyInstallments: installments.ready,
    skippedInstallments: installments.skipped,
    reviewInstallments: installments.review,
    errorInstallments: installments.error,
    installmentsReady: installments.ready,
    installmentsReview: installments.review,
    installmentsError: installments.error,
    blockedRecords: clients.error + contracts.error + installments.error,
    warningsImportablesTotal:
      warningCount(result.clients) +
      warningCount(result.contracts) +
      warningCount(result.installments),
    warningClients: warningCount(result.clients),
    warningContracts: warningCount(result.contracts),
    warningInstallments: warningCount(result.installments),
    registrosReady: clients.ready + contracts.ready + installments.ready,
    registrosSkipped: installments.skipped,
    registrosError: clients.error + contracts.error + installments.error,
    errores_bloqueantes: clients.error + contracts.error + installments.error,
    warnings_importables:
      warningCount(result.clients) +
      warningCount(result.contracts) +
      warningCount(result.installments),
  };
}

export class ClientImportService {
  constructor(private readonly db: DbWithTransaction = prisma) {}

  private async parseWorkbook(fileBuffer: Buffer): Promise<WorkbookRows> {
    const workbook = XLSX.read(fileBuffer, {
      type: "buffer",
      cellDates: true,
      raw: false,
    });

    return {
      clients: extractRows(workbook, SHEETS.CLIENTES),
      contacts: extractRows(workbook, SHEETS.CONTACTOS),
      billing: extractRows(workbook, SHEETS.FACTURACION),
      contracts: extractRows(workbook, SHEETS.CONTRATOS),
      installments: extractRows(workbook, SHEETS.CUOTAS),
    };
  }

  async previewImport(input: {
    fileName: string;
    fileBuffer: Buffer;
    createdBy: number;
  }) {
    const rows = await this.parseWorkbook(input.fileBuffer);

    const rawRuts = rows.clients
      .map((row) => normalizeRut(pickValue(row.data, ["rut", "rut *"])))
      .filter((value): value is string => Boolean(value));

    const existingClients = await this.db.cliente.findMany({
      where: {
        rut: { in: rawRuts },
      },
      select: {
        id: true,
        rut: true,
      },
    });

    const existingClientRuts = new Set(existingClients.map((item) => item.rut));
    const existingClientsByRut = new Map(existingClients.map((item) => [item.rut, item.id]));

    const preview = buildPreviewFromRows(rows, existingClientRuts);

    const existingContractRows = await findExistingContracts(
      this.db,
      preview.contracts,
      existingClientsByRut,
    );

    for (const contract of preview.contracts) {
      if (existingContractRows.has(contract.rowNumber)) {
        contract.issues.push({
          code: "EXISTING_CONTRACT",
          message: "Contrato ya existe en base de datos y no se duplicara.",
          severity: "warning",
        });
        contract.status = asImportStatus(contract.issues);
      }
    }

    const summary = batchSummary(preview);

    const batch = await this.db.clientImportBatch.create({
      data: {
        filename: input.fileName,
        status: ImportBatchStatus.PREVIEW_READY,
        total_clients: summary.totalClients,
        ready_clients: summary.readyClients,
        review_clients: summary.reviewClients,
        error_clients: summary.errorClients,
        created_by: input.createdBy,
      },
      select: { id: true },
    });

    await this.db.clientImportItem.createMany({
      data: preview.clients.map((item) => ({
        batch_id: batch.id,
        row_number: item.rowNumber,
        source_sheet: SHEETS.CLIENTES,
        rut: item.rut,
        nombre_razon_social: item.nombreRazonSocial,
        tipo_persona: item.tipoPersona,
        estado_cliente: item.estadoCliente,
        fecha_ingreso: item.fechaIngreso,
        raw_data: toPrismaJson(item.rawData),
        normalized_data: item.normalizedData ? toPrismaJson(item.normalizedData) : undefined,
        status: item.status,
        errors: item.issues.length > 0 ? toPrismaJson(item.issues) : undefined,
      })),
    });

    await this.db.contractImportItem.createMany({
      data: preview.contracts.map((item) => ({
        batch_id: batch.id,
        row_number: item.rowNumber,
        cliente_rut: item.clienteRut,
        servicio: item.servicio,
        area: item.area,
        monto_total: item.montoTotal,
        cantidad_cuotas: item.cantidadCuotas,
        fecha_inicio: item.fechaInicio,
        estado_contrato: item.estadoContrato,
        raw_data: toPrismaJson(item.rawData),
        normalized_data: item.normalizedData ? toPrismaJson(item.normalizedData) : undefined,
        status: item.status,
        errors: item.issues.length > 0 ? toPrismaJson(item.issues) : undefined,
      })),
    });

    await this.db.installmentImportItem.createMany({
      data: preview.installments.map((item) => ({
        batch_id: batch.id,
        row_number: item.rowNumber,
        contrato_ref: item.contratoRef,
        numero_cuota: item.numeroCuota,
        monto: item.monto,
        fecha_vencimiento: item.fechaVencimiento,
        estado_cuota: item.estadoCuota,
        raw_data: toPrismaJson(item.rawData),
        normalized_data: item.normalizedData ? toPrismaJson(item.normalizedData) : undefined,
        status: item.status,
        errors: item.issues.length > 0 ? toPrismaJson(item.issues) : undefined,
      })),
    });

    return {
      batchId: batch.id,
      summary,
      preview: {
        clients: preview.clients,
        contracts: preview.contracts,
        installments: preview.installments,
      },
    };
  }

  async confirmImport(batchId: number, options: ConfirmImportOptions = {}) {
    const currentBatch = await this.db.clientImportBatch.findUnique({
      where: { id: batchId },
      select: { id: true, status: true },
    });

    if (!currentBatch) {
      throw new Error("Batch no encontrado.");
    }

    if (currentBatch.status === ImportBatchStatus.CONFIRMED) {
      return this.getBatchReport(batchId);
    }

    await this.db.clientImportBatch.update({
      where: { id: batchId },
      data: { status: ImportBatchStatus.PROCESSING },
    });

    const [clientItems, contractItems, installmentItems] = await Promise.all([
      this.db.clientImportItem.findMany({
        where: { batch_id: batchId },
        orderBy: { row_number: "asc" },
      }),
      this.db.contractImportItem.findMany({
        where: { batch_id: batchId },
        orderBy: { row_number: "asc" },
      }),
      this.db.installmentImportItem.findMany({
        where: { batch_id: batchId },
        orderBy: { row_number: "asc" },
      }),
    ]);

    const policy = resolveConfirmImportPolicy(options);
    const clientItemsByRut = new Map<string, typeof clientItems>();
    const importableClientsByRut = new Map<
      string,
      { item: (typeof clientItems)[number]; normalized: NormalizedClient }
    >();

    for (const item of clientItems) {
      const rutKey = normalizeRutRaw(item.rut)?.toUpperCase() ?? null;
      if (rutKey) {
        const list = clientItemsByRut.get(rutKey) ?? [];
        list.push(item);
        clientItemsByRut.set(rutKey, list);
      }

      if (!isStatusImportable(item.status, policy)) continue;
      const normalized = item.normalized_data as NormalizedClient | null;
      const normalizedRut = normalizeRutRaw(normalized?.rut)?.toUpperCase() ?? null;
      if (!normalized || !normalizedRut) continue;

      const current = importableClientsByRut.get(normalizedRut);
      if (!current || (current.item.status !== "READY" && item.status === "READY")) {
        importableClientsByRut.set(normalizedRut, { item, normalized });
      }
    }

    const installmentsByContractRow = new Map<number, typeof installmentItems>();
    const installmentsByExternalRef = new Map<string, typeof installmentItems>();
    for (const item of installmentItems) {
      const normalized = item.normalized_data as NormalizedInstallment | null;
      if (!normalized) continue;
      if (normalized.contractRowNumber !== null) {
        const list = installmentsByContractRow.get(normalized.contractRowNumber) ?? [];
        list.push(item);
        installmentsByContractRow.set(normalized.contractRowNumber, list);
      }
      if (normalized.contractExternalId) {
        const key = normalized.contractExternalId.trim().toUpperCase();
        const list = installmentsByExternalRef.get(key) ?? [];
        list.push(item);
        installmentsByExternalRef.set(key, list);
      }
    }

    const importableContractItems = contractItems.filter((item) =>
      isStatusImportable(item.status, policy),
    );
    const chunkSize = 20;

    for (let i = 0; i < importableContractItems.length; i += chunkSize) {
      const chunk = importableContractItems.slice(i, i + chunkSize);

      for (const contractItem of chunk) {
        const normalizedContract = contractItem.normalized_data as NormalizedContract | null;
        const contractIssues = parseIssues(contractItem.errors);

        if (!normalizedContract) {
          await this.db.contractImportItem.update({
            where: { id: contractItem.id },
            data: {
              status: "ERROR",
              errors: toPrismaJson([
                ...contractIssues,
                {
                  code: "MISSING_NORMALIZED_CONTRACT",
                  message: "No hay datos normalizados para importar contrato.",
                  severity: "error",
                } satisfies ImportIssue,
              ]),
            },
          });
          continue;
        }

        const relatedInstallments = [
          ...(installmentsByContractRow.get(contractItem.row_number) ?? []),
          ...(normalizedContract.externalContractId
            ? installmentsByExternalRef.get(
                normalizedContract.externalContractId.trim().toUpperCase(),
              ) ?? []
            : []),
        ].filter((value, index, arr) => arr.findIndex((x) => x.id === value.id) === index);

        const contractClientRutKey = normalizeRutRaw(normalizedContract.clienteRut)?.toUpperCase();
        const clientCandidates = contractClientRutKey
          ? (clientItemsByRut.get(contractClientRutKey) ?? [])
          : [];
        const importableClient = contractClientRutKey
          ? (importableClientsByRut.get(contractClientRutKey) ?? null)
          : null;

        if (clientCandidates.length > 0 && !importableClient) {
          const issueCode =
            policy.onlyReady && clientCandidates.length > 0
              ? "CLIENT_NOT_READY_FOR_STRICT_IMPORT"
              : "CLIENT_NOT_IMPORTABLE_FOR_POLICY";
          const issueMessage =
            policy.onlyReady && clientCandidates.length > 0
              ? "Contrato omitido: el cliente asociado no esta READY para importacion estricta."
              : "Contrato omitido: el cliente asociado no cumple la politica de importacion.";

          await this.db.contractImportItem.update({
            where: { id: contractItem.id },
            data: {
              status: "SKIPPED",
              errors: toPrismaJson([
                ...contractIssues,
                {
                  code: issueCode,
                  message: issueMessage,
                  severity: "error",
                } satisfies ImportIssue,
              ]),
            },
          });

          for (const installmentItem of relatedInstallments) {
            if (!isStatusImportable(installmentItem.status, policy)) continue;
            const installmentIssues = parseIssues(installmentItem.errors);
            await this.db.installmentImportItem.update({
              where: { id: installmentItem.id },
              data: {
                status: "SKIPPED",
                errors: toPrismaJson([
                  ...installmentIssues,
                  {
                    code: "CONTRACT_SKIPPED_BY_IMPORT_POLICY",
                    message:
                      "Cuota omitida porque su contrato fue omitido por politica de importacion.",
                    severity: "error",
                  } satisfies ImportIssue,
                ]),
              },
            });
          }
          continue;
        }

        try {
          await this.db.$transaction(
            async (tx) => {
              const externalReferenceService = new ExternalReferenceService(tx);
              const normalizedClient = importableClient?.normalized ?? null;
              const clientItem = importableClient?.item ?? null;

              const cliente = await tx.cliente.upsert({
                where: { rut: normalizedContract.clienteRut },
                update: {
                  ...(normalizedClient
                    ? {
                        nombre: normalizedClient.nombreRazonSocial,
                        tipo_cliente: normalizedClient.tipoCliente,
                        estado: normalizedClient.estadoCliente,
                        fecha_ingreso: new Date(normalizedClient.fechaIngreso),
                        telefono: normalizedClient.contactoPrincipal?.telefono ?? null,
                        email: normalizedClient.contactoPrincipal?.email ?? null,
                      }
                    : {}),
                },
                create: {
                  rut: normalizedContract.clienteRut,
                  nombre: normalizedClient?.nombreRazonSocial ?? "Cliente importado",
                  tipo_cliente: normalizedClient?.tipoCliente ?? TipoCliente.PERSONA,
                  estado: normalizedClient?.estadoCliente ?? EstadoCliente.ACTIVO,
                  fecha_ingreso: new Date(
                    normalizedClient?.fechaIngreso ?? normalizedContract.fechaInicio,
                  ),
                  telefono: normalizedClient?.contactoPrincipal?.telefono ?? null,
                  email: normalizedClient?.contactoPrincipal?.email ?? null,
                },
              });

              if (clientItem) {
                await tx.clientImportItem.update({
                  where: { id: clientItem.id },
                  data: {
                    status: "IMPORTED",
                    created_cliente_id: cliente.id,
                  },
                });
              }

              if (normalizedClient?.contactoPrincipal) {
                const existingPrincipal = await tx.clienteContacto.findFirst({
                  where: { cliente_id: cliente.id, es_principal: true },
                  select: { id: true },
                });
                if (existingPrincipal) {
                  await tx.clienteContacto.update({
                    where: { id: existingPrincipal.id },
                    data: {
                      nombre: normalizedClient.contactoPrincipal.nombre,
                      email: normalizedClient.contactoPrincipal.email,
                      telefono: normalizedClient.contactoPrincipal.telefono,
                      cargo: normalizedClient.contactoPrincipal.cargo,
                      recibe_notificaciones:
                        normalizedClient.contactoPrincipal.recibeNotificaciones,
                      recibe_comprobantes:
                        normalizedClient.contactoPrincipal.recibeComprobantes,
                      whatsapp: normalizedClient.contactoPrincipal.whatsapp,
                    },
                  });
                } else {
                  await tx.clienteContacto.create({
                    data: {
                      cliente_id: cliente.id,
                      nombre: normalizedClient.contactoPrincipal.nombre,
                      email: normalizedClient.contactoPrincipal.email,
                      telefono: normalizedClient.contactoPrincipal.telefono,
                      cargo: normalizedClient.contactoPrincipal.cargo,
                      es_principal: true,
                      recibe_notificaciones:
                        normalizedClient.contactoPrincipal.recibeNotificaciones,
                      recibe_comprobantes:
                        normalizedClient.contactoPrincipal.recibeComprobantes,
                      whatsapp: normalizedClient.contactoPrincipal.whatsapp,
                    },
                  });
                }
              }

              if (normalizedClient?.facturacion) {
                await tx.clienteFacturacion.upsert({
                  where: {
                    cliente_id_rut_facturacion: {
                      cliente_id: cliente.id,
                      rut_facturacion: normalizedClient.facturacion.rutFacturacion,
                    },
                  },
                  update: {
                    razon_social_facturacion: normalizedClient.facturacion.razonSocial,
                    giro_facturacion: normalizedClient.facturacion.giro,
                    direccion_facturacion: normalizedClient.facturacion.direccion,
                    comuna: normalizedClient.facturacion.comuna,
                    ciudad: normalizedClient.facturacion.ciudad,
                    region: normalizedClient.facturacion.region,
                    email_facturacion: normalizedClient.facturacion.email,
                    tipo_documento_preferido:
                      normalizedClient.facturacion.tipoDocumento,
                    requiere_oc: normalizedClient.facturacion.requiereOc,
                    condicion_pago: normalizedClient.facturacion.condicionPago,
                  },
                  create: {
                    cliente_id: cliente.id,
                    rut_facturacion: normalizedClient.facturacion.rutFacturacion,
                    razon_social_facturacion: normalizedClient.facturacion.razonSocial,
                    giro_facturacion: normalizedClient.facturacion.giro,
                    direccion_facturacion: normalizedClient.facturacion.direccion,
                    comuna: normalizedClient.facturacion.comuna,
                    ciudad: normalizedClient.facturacion.ciudad,
                    region: normalizedClient.facturacion.region,
                    email_facturacion: normalizedClient.facturacion.email,
                    tipo_documento_preferido:
                      normalizedClient.facturacion.tipoDocumento,
                    requiere_oc: normalizedClient.facturacion.requiereOc,
                    condicion_pago: normalizedClient.facturacion.condicionPago,
                  },
                });
              }

              if (normalizedClient?.enablePagacuotas) {
                await externalReferenceService.upsertReference({
                  systemCode: EXTERNAL_SYSTEM_CODES.PAGACUOTAS,
                  entityType: ExternalEntityType.CLIENTE,
                  entityId: cliente.id,
                  externalId: normalizedClient.rut,
                });
              }

              const existingByExternal = normalizedContract.externalContractId
                ? await tx.contrato.findUnique({
                    where: { external_id: normalizedContract.externalContractId },
                    select: { id: true },
                  })
                : null;

              const existingByComposite = await tx.contrato.findUnique({
                where: {
                  cliente_id_tipo_servicio_monto_ccto_fecha_contrato: {
                    cliente_id: cliente.id,
                    tipo_servicio: normalizedContract.servicio,
                    monto_ccto: normalizedContract.montoTotal,
                    fecha_contrato: new Date(normalizedContract.fechaInicio),
                  },
                },
                select: { id: true },
              });

              const existing = existingByExternal ?? existingByComposite;
              const contrato = await tx.contrato.upsert({
                where: {
                  cliente_id_tipo_servicio_monto_ccto_fecha_contrato: {
                    cliente_id: cliente.id,
                    tipo_servicio: normalizedContract.servicio,
                    monto_ccto: normalizedContract.montoTotal,
                    fecha_contrato: new Date(normalizedContract.fechaInicio),
                  },
                },
                update: {
                  external_id: normalizedContract.externalContractId,
                  estado: normalizedContract.estadoContrato,
                  cantidad_cuotas_original: normalizedContract.cantidadCuotas,
                  observaciones:
                    [
                      normalizedContract.area ? `Area: ${normalizedContract.area}` : null,
                      normalizedContract.observaciones,
                    ]
                      .filter(Boolean)
                      .join(" | ") || null,
                },
                create: {
                  cliente_id: cliente.id,
                  external_id: normalizedContract.externalContractId,
                  tipo_servicio: normalizedContract.servicio,
                  fecha_contrato: new Date(normalizedContract.fechaInicio),
                  monto_ccto: normalizedContract.montoTotal,
                  monto_pago_inicial: 0,
                  saldo_financiado: normalizedContract.montoTotal,
                  cantidad_cuotas_original: normalizedContract.cantidadCuotas,
                  estado: normalizedContract.estadoContrato,
                  observaciones:
                    [
                      normalizedContract.area ? `Area: ${normalizedContract.area}` : null,
                      normalizedContract.observaciones,
                    ]
                      .filter(Boolean)
                      .join(" | ") || null,
                },
                select: { id: true, fecha_contrato: true },
              });

              await tx.contractImportItem.update({
                where: { id: contractItem.id },
                data: {
                  status: existing ? "SKIPPED" : "IMPORTED",
                  created_contrato_id: contrato.id,
                },
              });

              for (const installmentItem of relatedInstallments) {
                if (!isStatusImportable(installmentItem.status, policy)) continue;
                const normalizedInstallment =
                  installmentItem.normalized_data as NormalizedInstallment | null;

                if (!normalizedInstallment) {
                  const baseIssues = parseIssues(installmentItem.errors);
                  await tx.installmentImportItem.update({
                    where: { id: installmentItem.id },
                    data: {
                      status: "ERROR",
                      errors: toPrismaJson([
                        ...baseIssues,
                        {
                          code: "MISSING_NORMALIZED_INSTALLMENT",
                          message: "No hay datos normalizados para importar cuota.",
                          severity: "error",
                        } satisfies ImportIssue,
                      ]),
                    },
                  });
                  continue;
                }

                const dueDate = normalizedInstallment.fechaVencimiento
                  ? new Date(normalizedInstallment.fechaVencimiento)
                  : addMonths(
                      contrato.fecha_contrato,
                      Math.max(normalizedInstallment.numeroCuota - 1, 0),
                    );
                const existingCuota = await tx.cuota.findUnique({
                  where: {
                    contrato_id_numero_cuota: {
                      contrato_id: contrato.id,
                      numero_cuota: normalizedInstallment.numeroCuota,
                    },
                  },
                  select: { id: true, monto_actual: true, monto_pagado: true },
                });

                const historicalPayment = detectHistoricalPayment({
                  installment: normalizedInstallment,
                  fallbackDueDate: dueDate,
                  importDate: new Date(),
                });
                const montoPagadoInicial =
                  historicalPayment.hasHistoricalPayment
                    ? historicalPayment.paymentAmount
                    : normalizedInstallment.estadoCuota === EstadoCuota.PAGADA
                      ? normalizedInstallment.monto
                      : 0;
                const saldoPendienteInicial =
                  historicalPayment.hasHistoricalPayment
                    ? historicalPayment.saldoPendiente
                    : Math.max(normalizedInstallment.monto - montoPagadoInicial, 0);
                const estadoInicial =
                  historicalPayment.hasHistoricalPayment
                    ? historicalPayment.targetInstallmentStatus
                    : normalizedInstallment.estadoCuota;
                const fechaPagoInicial =
                  historicalPayment.hasHistoricalPayment && historicalPayment.paymentAmount > 0
                    ? historicalPayment.paymentDate
                    : montoPagadoInicial > 0
                      ? dueDate
                      : null;

                const cuota = await tx.cuota.upsert({
                  where: {
                    contrato_id_numero_cuota: {
                      contrato_id: contrato.id,
                      numero_cuota: normalizedInstallment.numeroCuota,
                    },
                  },
                  update: {
                    fecha_vencimiento: dueDate,
                    monto_original: normalizedInstallment.monto,
                    monto_actual: normalizedInstallment.monto,
                    monto_pagado: montoPagadoInicial,
                    saldo_pendiente: saldoPendienteInicial,
                    estado: estadoInicial,
                    cobrable: normalizedInstallment.cobrable,
                    motivo_no_cobrable: normalizedInstallment.motivoNoCobrable,
                    fecha_pago: fechaPagoInicial,
                  },
                  create: {
                    contrato_id: contrato.id,
                    numero_cuota: normalizedInstallment.numeroCuota,
                    fecha_vencimiento: dueDate,
                    monto_original: normalizedInstallment.monto,
                    monto_actual: normalizedInstallment.monto,
                    monto_pagado: montoPagadoInicial,
                    saldo_pendiente: saldoPendienteInicial,
                    estado: estadoInicial,
                    cobrable: normalizedInstallment.cobrable,
                    motivo_no_cobrable: normalizedInstallment.motivoNoCobrable,
                    fecha_pago: fechaPagoInicial,
                  },
                  select: { id: true, monto_actual: true },
                });

                if (
                  historicalPayment.hasHistoricalPayment &&
                  historicalPayment.paymentAmount > 0 &&
                  historicalPayment.paymentDate
                ) {
                  const paymentDate = historicalPayment.paymentDate;
                  const paymentAmount = historicalPayment.paymentAmount;
                  const paymentEventId = historicalPayment.paymentEventId;
                  const reference =
                    paymentEventId ??
                    buildStableMigrationReference({
                      contractExternalId: normalizedContract.externalContractId,
                      contractId: contrato.id,
                      installmentNumber: normalizedInstallment.numeroCuota,
                      paymentAmount,
                      paymentDate,
                    });

                  let pago = paymentEventId
                    ? await tx.pago.findFirst({
                        where: { payment_event_id: paymentEventId },
                        select: { id: true, contrato_id: true, cuota_id: true },
                      })
                    : null;

                  if (pago && pago.contrato_id !== contrato.id) {
                    throw new Error(
                      `payment_id_externo ${paymentEventId} ya existe en otro contrato.`,
                    );
                  }

                  if (!pago) {
                    pago = await tx.pago.findFirst({
                      where: {
                        contrato_id: contrato.id,
                        cuota_id: cuota.id,
                        referencia: reference,
                      },
                      select: { id: true, contrato_id: true, cuota_id: true },
                    });
                  }

                  if (!pago) {
                    pago = await tx.pago.create({
                      data: {
                        cliente_id: cliente.id,
                        contrato_id: contrato.id,
                        cuota_id: cuota.id,
                        fecha_pago: paymentDate,
                        monto_pagado: paymentAmount,
                        estado: EstadoPago.CONFIRMADO,
                        medio_pago: historicalPayment.medioPago ?? "MIGRACION",
                        payment_event_id: paymentEventId,
                        referencia: reference,
                        comprobante_url: historicalPayment.comprobanteUrl,
                        observacion: historicalPayment.observacion,
                      },
                      select: { id: true, contrato_id: true, cuota_id: true },
                    });
                  }

                  const totalAplicadoExistenteRaw = await tx.aplicacionPago.aggregate({
                    where: { cuota_id: cuota.id },
                    _sum: { monto_aplicado: true },
                  });
                  const totalAplicadoExistente = Number(
                    totalAplicadoExistenteRaw._sum.monto_aplicado ?? 0,
                  );
                  const montoDisponible = Math.max(
                    Number(cuota.monto_actual) - totalAplicadoExistente,
                    0,
                  );
                  const montoAplicado = Math.min(paymentAmount, montoDisponible);

                  if (montoAplicado > 0) {
                    const existingApplication = await tx.aplicacionPago.findUnique({
                      where: {
                        pago_id_cuota_id: {
                          pago_id: pago.id,
                          cuota_id: cuota.id,
                        },
                      },
                      select: { id: true },
                    });

                    if (!existingApplication) {
                      await tx.aplicacionPago.create({
                        data: {
                          pago_id: pago.id,
                          cuota_id: cuota.id,
                          monto_aplicado: montoAplicado,
                        },
                      });
                    }
                  }

                  const totalAplicadoRaw = await tx.aplicacionPago.aggregate({
                    where: { cuota_id: cuota.id },
                    _sum: { monto_aplicado: true },
                  });
                  const totalAplicado = Number(totalAplicadoRaw._sum.monto_aplicado ?? 0);
                  const montoActual = Number(cuota.monto_actual);
                  const montoPagadoFinal = Math.min(totalAplicado, montoActual);
                  const saldoFinal = Math.max(montoActual - montoPagadoFinal, 0);
                  const estadoFinal = installmentStatusFromBalance(saldoFinal, montoActual);

                  await tx.cuota.update({
                    where: { id: cuota.id },
                    data: {
                      monto_pagado: montoPagadoFinal,
                      saldo_pendiente: saldoFinal,
                      estado: estadoFinal,
                      fecha_pago: montoPagadoFinal > 0 ? paymentDate : null,
                    },
                  });
                }

                await tx.installmentImportItem.update({
                  where: { id: installmentItem.id },
                  data: {
                    status: existingCuota ? "SKIPPED" : "IMPORTED",
                    created_cuota_id: cuota.id,
                  },
                });
              }
            },
            { maxWait: 10000, timeout: 30000 },
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Error en transaccion de contrato";
          await this.db.contractImportItem.update({
            where: { id: contractItem.id },
            data: {
              status: "ERROR",
              errors: toPrismaJson([
                ...contractIssues,
                {
                  code: "CONTRACT_TRANSACTION_FAILED",
                  message: errorMessage,
                  severity: "error",
                } satisfies ImportIssue,
              ]),
            },
          });
        }
      }
    }

    await this.db.clientImportBatch.update({
      where: { id: batchId },
      data: {
        status: ImportBatchStatus.CONFIRMED,
        confirmed_at: new Date(),
      },
    });

    return this.getBatchReport(batchId);
  }

  private async getBatchReportFromTx(tx: DbClient, batchId: number) {
    const [batch, clients, contracts, installments] = await Promise.all([
      tx.clientImportBatch.findUnique({
        where: { id: batchId },
      }),
      tx.clientImportItem.findMany({
        where: { batch_id: batchId },
        orderBy: { row_number: "asc" },
      }),
      tx.contractImportItem.findMany({
        where: { batch_id: batchId },
        orderBy: { row_number: "asc" },
      }),
      tx.installmentImportItem.findMany({
        where: { batch_id: batchId },
        orderBy: { row_number: "asc" },
      }),
    ]);

    if (!batch) {
      throw new Error("Batch no encontrado.");
    }

    const summarize = <T extends { status: string }>(items: T[]) => {
      const counts = new Map<string, number>();
      for (const item of items) {
        counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
      }
      return Object.fromEntries(counts.entries());
    };

    const manualReviewStatuses = new Set(["ERROR", "REVIEW", "SKIPPED"]);

    return {
      batch: {
        id: batch.id,
        filename: batch.filename,
        status: batch.status,
        createdAt: batch.created_at,
        confirmedAt: batch.confirmed_at,
      },
      summary: {
        clients: summarize(clients),
        contracts: summarize(contracts),
        installments: summarize(installments),
      },
      errors: {
        clients: clients
          .filter((item) => item.status === "ERROR")
          .map((item) => ({
            rowNumber: item.row_number,
            issues: parseIssues(item.errors),
            rut: item.rut,
          })),
        contracts: contracts
          .filter((item) => item.status === "ERROR")
          .map((item) => ({
            rowNumber: item.row_number,
            issues: parseIssues(item.errors),
            clienteRut: item.cliente_rut,
          })),
        installments: installments
          .filter((item) => item.status === "ERROR")
          .map((item) => ({
            rowNumber: item.row_number,
            issues: parseIssues(item.errors),
            contratoRef: item.contrato_ref,
          })),
      },
      manualReview: {
        clients: clients
          .filter((item) => manualReviewStatuses.has(item.status))
          .map((item) => ({
            rowNumber: item.row_number,
            status: item.status,
            rut: item.rut,
            nombreRazonSocial: item.nombre_razon_social,
            issues: parseIssues(item.errors),
            rawData: item.raw_data,
            normalizedData: item.normalized_data,
          })),
        contracts: contracts
          .filter((item) => manualReviewStatuses.has(item.status))
          .map((item) => ({
            rowNumber: item.row_number,
            status: item.status,
            clienteRut: item.cliente_rut,
            servicio: item.servicio,
            issues: parseIssues(item.errors),
            rawData: item.raw_data,
            normalizedData: item.normalized_data,
          })),
        installments: installments
          .filter((item) => manualReviewStatuses.has(item.status))
          .map((item) => ({
            rowNumber: item.row_number,
            status: item.status,
            contratoRef: item.contrato_ref,
            numeroCuota: item.numero_cuota,
            issues: parseIssues(item.errors),
            rawData: item.raw_data,
            normalizedData: item.normalized_data,
          })),
      },
    };
  }

  async getBatchReport(batchId: number) {
    return this.getBatchReportFromTx(this.db, batchId);
  }
}

