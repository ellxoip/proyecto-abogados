import { redirect } from "next/navigation";
import MagicLinkConsumer from "./MagicLinkConsumer";

export const dynamic = "force-dynamic";

/**
 * Consume magic-link tokens emitidos por
 * `/api/internal/integration/clients/auto-login`. PagaCuotas redirige al
 * cliente acá tras confirmar un pago, con `?token=…`. Si el JWT es
 * válido, el provider Credentials id="magic-link" crea la sesión NextAuth
 * y mandamos al cliente a `/portal`. Si no, lo dejamos en `/login`.
 */
export default async function MagicLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = (params.token ?? "").trim();
  if (!token) redirect("/login?error=magic-link-missing");

  return <MagicLinkConsumer token={token} />;
}
