// SQLite shim: const-object replacements for Postgres enums.
// Types widened to `string` so values returned by Prisma (string column) are
// assignable. The const objects still provide IDE autocomplete and runtime
// correctness — narrowing was sacrificed for the SQLite migration.
// Original enums preserved in prisma/schema.prisma.postgres.bak.

export const Role = {
  SUPER_ADMIN: "SUPER_ADMIN",
  JEFE_DE_MESA: "JEFE_DE_MESA",
  ABOGADO: "ABOGADO",
  CLIENTE: "CLIENTE",
  SISTEMA_CUOTAS: "SISTEMA_CUOTAS",
} as const;
export type Role = string;

export const CaseStage = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  FINISHED: "FINISHED",
  HALTED_BY_PAYMENT: "HALTED_BY_PAYMENT",
  WAITING_CUOTAS: "WAITING_CUOTAS",
} as const;
export type CaseStage = string;

export const CommentType = {
  INTERNAL: "INTERNAL",
  PUBLIC: "PUBLIC",
} as const;
export type CommentType = string;

export const PaymentStatus = {
  PAID: "PAID",
  UNPAID: "UNPAID",
  OVERDUE: "OVERDUE",
  RESTORED: "RESTORED",
} as const;
export type PaymentStatus = string;

export const CaseCategory = {
  TRIBUTARIO: "TRIBUTARIO",
  PENAL: "PENAL",
  CIVIL: "CIVIL",
  LABORAL: "LABORAL",
  FAMILIA: "FAMILIA",
  MIGRATORIO: "MIGRATORIO",
  OTRO: "OTRO",
} as const;
export type CaseCategory = string;

export const Satisfaction = {
  HAPPY: "HAPPY",
  NEUTRAL: "NEUTRAL",
  SAD: "SAD",
} as const;
export type Satisfaction = string;

export const AuditAction = {
  WHATSAPP_SENT: "WHATSAPP_SENT",
  WHATSAPP_FAILED: "WHATSAPP_FAILED",
  EMAIL_SENT: "EMAIL_SENT",
  EMAIL_FAILED: "EMAIL_FAILED",
  CASE_HALTED: "CASE_HALTED",
  CASE_REACTIVATED: "CASE_REACTIVATED",
  CASE_FINISHED: "CASE_FINISHED",
  CASE_DERIVED: "CASE_DERIVED",
  CASE_ASSIGNED: "CASE_ASSIGNED",
  COMMENT_POSTED: "COMMENT_POSTED",
  PAYMENT_RECORDED: "PAYMENT_RECORDED",
  SATISFACTION_SUBMITTED: "SATISFACTION_SUBMITTED",
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED: "LOGIN_FAILED",
  DATA_EXPORTED: "DATA_EXPORTED",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
} as const;
export type AuditAction = string;

export const ActivityCategory = {
  INVESTIGACION: "INVESTIGACION",
  REDACCION: "REDACCION",
  AUDIENCIAS: "AUDIENCIAS",
  REUNIONES: "REUNIONES",
  GESTION_ADMINISTRATIVA: "GESTION_ADMINISTRATIVA",
  OTRO: "OTRO",
} as const;
export type ActivityCategory = string;

export const SlaStatus = {
  CUMPLIDO: "CUMPLIDO",
  EN_RIESGO: "EN_RIESGO",
  INCUMPLIDO: "INCUMPLIDO",
} as const;
export type SlaStatus = string;

export const RiskLevel = {
  BAJO: "BAJO",
  MEDIO: "MEDIO",
  ALTO: "ALTO",
  CRITICO: "CRITICO",
} as const;
export type RiskLevel = string;

export const NotificationType = {
  SLA_RIESGO: "SLA_RIESGO",
  SLA_INCUMPLIDO: "SLA_INCUMPLIDO",
  CASO_ESTANCADO: "CASO_ESTANCADO",
  IA_URGENTE: "IA_URGENTE",
  RESUMEN_SEMANAL: "RESUMEN_SEMANAL",
  RECORDATORIO_HORAS: "RECORDATORIO_HORAS",
  LEAD_NUEVO: "LEAD_NUEVO",
  LEAD_RECORDATORIO: "LEAD_RECORDATORIO",
} as const;
export type NotificationType = string;

export const LeadSource = {
  CRM: "CRM",
  MANUAL: "MANUAL",
  WEB: "WEB",
} as const;
export type LeadSource = string;

export const LeadStatus = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  CONTACTED: "CONTACTED",
  CONVERTED: "CONVERTED",
  CANCELED: "CANCELED",
  NO_SHOW: "NO_SHOW",
} as const;
export type LeadStatus = string;

export const LeadPriority = {
  BAJA: "BAJA",
  NORMAL: "NORMAL",
  ALTA: "ALTA",
  URGENTE: "URGENTE",
} as const;
export type LeadPriority = string;
