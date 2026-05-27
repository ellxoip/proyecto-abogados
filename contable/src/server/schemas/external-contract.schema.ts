import { z } from "zod";

export const externalContractSchema = z.object({
  external_id: z.string().min(1),
  rut: z.string().min(3),
  nombre: z.string().min(2),
  telefono: z.string().optional(),
  email: z.string().email().optional(),
  fecha_ingreso: z.string().date(),
  tipo_servicio: z.string().min(2),
  ccto: z.number().positive(),
  pago_inicial: z.number().min(0),
  cantidad_cuotas: z.number().int().positive(),
  fecha_primera_cuota: z.string().date(),
});

export type ExternalContractInput = z.infer<typeof externalContractSchema>;
