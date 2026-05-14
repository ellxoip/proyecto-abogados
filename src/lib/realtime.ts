/**
 * Supabase Realtime channel naming convention for HIVE CONTROL Messenger.
 *
 * Why Supabase (not Socket.io): Vercel's serverless runtime cannot host a
 * long-lived WebSocket server. Supabase Realtime is already provisioned with
 * the database and offers presence + typing.
 *
 * Channels:
 *   case:{id}:public    →  Abogado ↔ Cliente comments (type = PUBLIC)
 *   case:{id}:internal  →  Staff Messenger (type = INTERNAL).
 *                          The CLIENT must NEVER subscribe here. RLS on the
 *                          comments table enforces it server-side; the
 *                          client-side subscription must mirror that gate.
 *
 * Subscription rule (client code):
 *   - role === 'CLIENTE'                       → public only
 *   - role in (ABOGADO, JEFE_DE_MESA, SUPER_ADMIN) → public + internal
 */
export const channelNames = {
  publicCase: (caseId: string) => `case:${caseId}:public`,
  internalCase: (caseId: string) => `case:${caseId}:internal`,
};
