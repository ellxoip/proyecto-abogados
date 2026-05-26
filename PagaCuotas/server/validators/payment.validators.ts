import { z } from 'zod';

// ============================================================
// Payment Intent Validation
// ============================================================

export const createPaymentIntentSchema = z.object({
  identifier: z.string().min(1, 'Identifier is required (RUT, email, or ID)'),
  cliente_contable_id: z.string().min(1, 'cliente_contable_id is required'),
  contrato_contable_id: z.string().min(1, 'contrato_contable_id is required'),
  cuota_ids: z.array(z.string()).min(1, 'At least one cuota_id is required'),
  amount: z.number().positive('Amount must be positive'),
  provider: z.enum(['mercadopago', 'transbank', 'flow', 'simulator']).default('mercadopago'),
});

export const createIntegrationPaymentIntentSchema = z.object({
  identifier: z.string().min(1, 'identifier es requerido'),
  cliente_contable_id: z.string().min(1, 'cliente_contable_id es requerido'),
  contrato_contable_id: z.string().min(1, 'contrato_contable_id es requerido'),
  cuota_ids: z.array(z.string()).min(1, 'cuota_ids debe tener al menos una cuota'),
  amount: z.number().positive('amount debe ser mayor a cero'),
});

export type CreateIntegrationPaymentIntentInput = z.infer<typeof createIntegrationPaymentIntentSchema>;

export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>;

// ============================================================
// Webhook Payload Validation
// ============================================================

export const webhookPayloadSchema = z.object({
  external_attempt_id: z.string().min(1),
  provider_transaction_id: z.string().min(1),
  status: z.enum(['approved', 'rejected', 'failed', 'error']),
  amount: z.number().positive(),
  method: z.string().optional(),
  authorization_code: z.string().optional(),
  error_code: z.string().optional(),
  error_message: z.string().optional(),
});

export type WebhookPayloadInput = z.infer<typeof webhookPayloadSchema>;

// ============================================================
// Reversal Webhook Validation
// ============================================================

export const reversalWebhookSchema = z.object({
  external_payment_id: z.string().min(1),
  provider_transaction_id: z.string().min(1),
  amount: z.number().positive(),
  reason: z.string().min(1),
  provider_reversal_code: z.string().optional(),
});

export type ReversalWebhookInput = z.infer<typeof reversalWebhookSchema>;

// ============================================================
// Admin Params Validation
// ============================================================

export const resyncParamsSchema = z.object({
  id: z.string().uuid('Invalid payment ID'),
});

// ============================================================
// Query Params Validation
// ============================================================

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const paymentAttemptsQuerySchema = paginationSchema.extend({
  status: z.enum(['iniciado', 'pendiente', 'autorizado', 'confirmado', 'rechazado', 'expirado', 'error', 'reversado']).optional(),
  provider: z.enum(['mercadopago', 'transbank', 'flow', 'simulator']).optional(),
});

export const paymentsQuerySchema = paginationSchema.extend({
  status: z.enum(['confirmado', 'reversado']).optional(),
});

export const integrationLogsQuerySchema = paginationSchema.extend({
  system: z.enum(['sis_contable', 'crm', 'payment_provider', 'billing_provider']).optional(),
  direction: z.enum(['inbound', 'outbound']).optional(),
});
