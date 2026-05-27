/**
 * Moderación del chat (centro de mensajería).
 *
 * Bloquea groserías/garabatos e insultos para que ni el cliente ni los
 * abogados puedan agredirse o hacer daño psicológico. Aplica server-side en
 * el envío de mensajes (postComment), así que cubre TODOS los roles por igual.
 *
 * Baneo por strikes: cada mensaje bloqueado se registra en audit_logs como
 * MODERATION_BLOCKED. Al acumular BAN_THRESHOLD ofensas dentro de BAN_WINDOW_MS
 * el usuario queda suspendido del chat hasta que la ventana expire.
 */

import { withSystemRls } from "@/lib/rls";

export const BAN_THRESHOLD = 3;
export const BAN_WINDOW_MS = 60 * 60 * 1000; // 1 hora

const LEET: Record<string, string> = {
  "4": "a", "@": "a", "3": "e", "1": "i", "!": "i", "0": "o", "5": "s", "$": "s", "7": "t",
};

/**
 * Normaliza para frustrar evasiones: minúsculas, sin acentos, leetspeak a
 * letras, y colapsa repeticiones (3+ del mismo char) — "pvtaaaa"/"p4to" → base.
 */
function normalize(input: string): string {
  let t = input.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  t = t.replace(/[4@31!05$7]/g, (c) => LEET[c] ?? c);
  t = t.replace(/(.)\1{2,}/g, "$1"); // 3+ repeticiones -> 1
  return t;
}

// Palabras (match por límite de palabra para no pegar falsos positivos como
// "computadora"/"disputa"). Ya en forma sin acentos.
const BANNED_WORDS: readonly string[] = [
  "weon", "weona", "weco", "hueon", "huevon", "aweonao", "aweonado", "aweona",
  "culiao", "culiada", "culiado", "culeao", "qliao", "qliada", "qliado",
  "ctm", "csm", "conchetumare", "conchatumadre", "conchesumadre", "conchasumadre", "ckt",
  "maricon", "maraco", "maraca", "marica", "fleto",
  "puta", "puto", "putas", "putos", "putear", "putamadre", "putazo",
  "mierda", "pichula", "pichulas", "chucha", "chuchetumare", "choro",
  "cabron", "cabrona", "malparido", "hdp", "hijoeputa", "hijodeputa", "hijaeputa",
  "imbecil", "idiota", "estupido", "estupida", "tarado", "tarada", "subnormal",
  "gil", "gila", "garca", "lacra", "escoria", "asqueroso", "asquerosa", "degenerado",
  "pendejo", "pendeja", "pelotudo", "boludo", "gilipollas", "capullo", "culero",
  "zorra", "verga", "vergas", "coño", "cono", "mamon", "mamona", "sorete",
  "matate", "muerete", "suicidate", "inservible",
];

// Frases (match por substring sobre el texto normalizado).
const BANNED_PHRASES: readonly string[] = [
  "hijo de puta", "hija de puta", "hijo de p",
  "anda a la mierda", "andate a la mierda", "vete a la mierda", "vayase a la mierda",
  "anda al pico", "andate al pico", "chupa pico", "chupame",
  "ojala te mueras", "ojala te mueras", "que te mueras",
  "no sirves para nada", "no servis para nada", "eres una basura", "eres un inutil",
  "te voy a matar", "te voy a hacer",
];

export type ModerationResult = { offensive: boolean; matched: string[] };

/** Análisis puro (sin DB). Útil también para feedback en el cliente. */
export function moderateText(text: string): ModerationResult {
  const norm = normalize(text);
  const matched: string[] = [];
  for (const w of BANNED_WORDS) {
    if (new RegExp(`\\b${w}\\b`).test(norm)) matched.push(w);
  }
  for (const p of BANNED_PHRASES) {
    if (norm.includes(p)) matched.push(p);
  }
  return { offensive: matched.length > 0, matched: [...new Set(matched)] };
}

export type ModerationVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Aplica moderación + baneo a un envío de mensaje. Registra cada ofensa en
 * audit_logs (commit propio) y suspende al acumular strikes. No crea el
 * mensaje: el caller solo procede si `ok: true`.
 */
export async function enforceMessageModeration(args: {
  userId: string;
  caseId: string;
  text: string;
}): Promise<ModerationVerdict> {
  const { userId, caseId, text } = args;
  const verdict = moderateText(text);

  return withSystemRls(async (tx) => {
    const since = new Date(Date.now() - BAN_WINDOW_MS);
    const priorOffenses = await tx.auditLog.count({
      where: { actorId: userId, action: "MODERATION_BLOCKED", createdAt: { gte: since } },
    });

    // Ya suspendido: rechaza cualquier mensaje (ofensivo o no) hasta que expire.
    if (priorOffenses >= BAN_THRESHOLD) {
      return {
        ok: false,
        reason:
          "Estás temporalmente suspendido del chat por uso reiterado de lenguaje ofensivo. " +
          "Intenta nuevamente más tarde.",
      };
    }

    if (!verdict.offensive) return { ok: true };

    // Registra la ofensa (persiste como strike) y avisa.
    await tx.auditLog.create({
      data: {
        action: "MODERATION_BLOCKED",
        actorId: userId,
        caseId,
        channel: "chat",
        status: "failed",
        message: `Mensaje bloqueado por lenguaje ofensivo: ${verdict.matched.join(", ")}`,
      },
    });

    const strikes = priorOffenses + 1;
    if (strikes >= BAN_THRESHOLD) {
      return {
        ok: false,
        reason:
          "Mensaje bloqueado. Has sido suspendido del chat por uso reiterado de lenguaje ofensivo. " +
          "El respeto es obligatorio para cliente y abogados.",
      };
    }
    return {
      ok: false,
      reason:
        `Mensaje bloqueado por contener lenguaje ofensivo o agresivo (advertencia ${strikes} de ${BAN_THRESHOLD}). ` +
        "Mantén un trato respetuoso.",
    };
  });
}
