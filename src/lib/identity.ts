/**
 * Normalización canónica de identificadores que llegan vía integraciones.
 *
 * Centraliza reglas que estaban duplicadas en cada route. Critical path:
 * el matching de cliente por RUT/email DEBE usar siempre la misma
 * normalización en escritura y lectura — si no, un mismo cliente acaba
 * con dos rows (12.345.678-9 vs 12345678-9).
 */

const RUT_DOTS_RE = /\./g;

/**
 * Normaliza un RUT chileno:
 *   - quita puntos
 *   - lowercase (dígito verificador K)
 *   - trim
 *
 * Garantiza match estable contra User.rut (unique index).
 */
export function normalizeRut(rut: string | null | undefined): string {
  if (!rut) return "";
  return rut.replace(RUT_DOTS_RE, "").toLowerCase().trim();
}

/**
 * Normaliza un email:
 *   - lowercase
 *   - trim
 *
 * No expande aliases (no quita el "+suffix" de gmail) para no romper
 * matching con sistemas que sí los respetan.
 */
export function normalizeEmail(email: string | null | undefined): string {
  if (!email) return "";
  return email.toLowerCase().trim();
}

/**
 * Normaliza un número de teléfono a formato E.164 best-effort:
 *   - mantiene "+" inicial
 *   - elimina espacios, guiones, paréntesis, puntos
 *
 * No fuerza prefijo país: si el integrador manda "+56...", se preserva.
 * Si llega solo "9..." se devuelve "9...". El validator de canal
 * (WhatsApp/SMS) decide qué hacer con un MSISDN incompleto.
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/[^\d+]/g, "").trim();
}
