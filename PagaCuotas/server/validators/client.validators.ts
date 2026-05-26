import { z } from 'zod';

export const clientLoginSchema = z.object({
  identifier: z.string().trim().min(3, 'Identificador requerido'),
  password: z.string().trim().regex(/^[a-zA-Z0-9]{6}$/, 'La clave debe tener 6 caracteres alfanumericos'),
});

export const clientPasswordUpdateSchema = z.object({
  identifier: z.string().trim().min(3, 'Identificador requerido'),
  currentPassword: z.string().trim().regex(/^[a-zA-Z0-9]{6}$/, 'Clave actual invalida'),
  newPassword: z.string().trim().regex(/^[a-zA-Z0-9]{6}$/, 'La nueva clave debe tener 6 caracteres alfanumericos'),
});

export type ClientLoginInput = z.infer<typeof clientLoginSchema>;
