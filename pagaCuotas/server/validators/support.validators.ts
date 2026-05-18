import { z } from 'zod';

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional()
);

const optionalEmail = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().email().optional()
);

export const createSupportTicketSchema = z.object({
  requester_identifier: z.string().trim().min(3, 'Ingresa un identificador valido.'),
  requester_name: optionalText,
  requester_email: optionalEmail,
  requester_phone: optionalText,
  subject: z.string().trim().min(5, 'El asunto debe tener al menos 5 caracteres.').max(120),
  category: z.enum(['payment', 'access', 'debt', 'technical', 'other']),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  message: z.string().trim().min(10, 'El mensaje debe tener al menos 10 caracteres.').max(2000),
  source: optionalText,
});

export const updateSupportTicketSchema = z.object({
  status: z.enum(['open', 'in_progress', 'answered', 'closed']).optional(),
  admin_response: z.string().max(2000).optional(),
  assigned_to: z.string().max(120).optional(),
});
