import crypto from "node:crypto";
import bcrypt from "bcryptjs";

/**
 * Genera una contraseña temporal aleatoria de 8 caracteres alfanuméricos.
 * Usa un alfabeto sin 0/O/1/I para evitar ambigüedad visual cuando el
 * cliente la transcribe desde WhatsApp/Email.
 *
 * Reemplaza al patrón determinista anterior (firstName + last4 phone), que
 * era predecible y se regeneraba en cada callback — invalidando passwords
 * que el cliente ya había cambiado.
 */
export function generateSecurePassword(length = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}
