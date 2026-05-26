export const EXTERNAL_SYSTEM_CODES = {
  AT_INFORMA: "AT_INFORMA",
  CRM: "CRM",
  PAGACUOTAS: "PAGACUOTAS",
} as const;

export type ExternalSystemCode =
  (typeof EXTERNAL_SYSTEM_CODES)[keyof typeof EXTERNAL_SYSTEM_CODES];

export const DEFAULT_SYSTEM_NAMES: Record<ExternalSystemCode, string> = {
  AT_INFORMA: "AT-INFORMA",
  CRM: "CRM",
  PAGACUOTAS: "PagaCuotas",
};
