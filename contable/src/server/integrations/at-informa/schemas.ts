import { z } from "zod";

const AtInformaCuotaEstadoSchema = z.enum(["PAID", "UNPAID", "OVERDUE", "RESTORED"]);

export const AtInformaClienteSchema = z.object({
  id: z.string().min(1),
  rut: z.string().min(1),
  nombre: z.string().min(1),
  email: z.string().email().nullable().optional(),
  telefono: z.string().nullable().optional(),
});

export const AtInformaCasoSchema = z.object({
  id: z.string().min(1),
  codigo: z.string().nullable().optional(),
  categoria: z.string().nullable().optional(),
  estado: z.string().nullable().optional(),
  pagado: z.boolean().optional(),
  boleta_inicial: z.string().nullable().optional(),
});

export const AtInformaContratoSchema = z.object({
  ccto: z.coerce.number(),
  pago_inicial: z.coerce.number(),
  saldo_financiado: z.coerce.number(),
  cantidad_cuotas: z.coerce.number().int().nonnegative(),
  fecha_primera_cuota: z.string().nullable().optional(),
  dia_pago: z.coerce.number().int().nullable().optional(),
  total_pagado: z.coerce.number().nullable().optional(),
  saldo_pendiente: z.coerce.number().nullable().optional(),
  saldo_vencido: z.coerce.number().nullable().optional(),
  estado_financiero: z.string().nullable().optional(),
});

export const AtInformaCuotaSchema = z.object({
  id: z.string().min(1),
  numero_cuota: z.coerce.number().int().nonnegative(),
  fecha_vencimiento: z.string().min(1),
  monto: z.coerce.number(),
  monto_pagado: z.coerce.number(),
  saldo_pendiente: z.coerce.number(),
  estado: AtInformaCuotaEstadoSchema,
  comprobante_url: z.string().nullable().optional(),
  registrado_en: z.string().nullable().optional(),
  pagado_en: z.string().nullable().optional(),
});

export const AtInformaPlanSchema = z.object({
  cliente: AtInformaClienteSchema,
  caso: AtInformaCasoSchema,
  contrato: AtInformaContratoSchema,
  cuotas: z.array(AtInformaCuotaSchema),
});

export const AtInformaPlanPagosResponseSchema = z.object({
  success: z.boolean(),
  total: z.coerce.number().int().nonnegative().optional(),
  generado_en: z.string().optional(),
  planes: z.array(AtInformaPlanSchema),
});

export const NotifyAtInformaPagoSchema = z.object({
  caso_id: z.string().min(1),
  payment_event_id: z.string().min(1).optional(),
  numero_cuota: z.coerce.number().int().positive().optional(),
  estado: AtInformaCuotaEstadoSchema,
  monto: z.coerce.number(),
  monto_pagado: z.coerce.number().optional(),
  fecha_pago: z.string().optional(),
  comprobante: z.string().url().nullable().optional(),
  referencia: z.string().optional(),
});

export type AtInformaPlanPagosResponse = z.infer<typeof AtInformaPlanPagosResponseSchema>;
export type AtInformaPlan = z.infer<typeof AtInformaPlanSchema>;
export type AtInformaCuotaEstado = z.infer<typeof AtInformaCuotaEstadoSchema>;
export type NotifyAtInformaPago = z.infer<typeof NotifyAtInformaPagoSchema>;
