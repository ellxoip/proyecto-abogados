import { NextResponse } from "next/server";
import { getSession } from "./session";

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

const MUTATION_ROLES = ["ADMIN", "CONTADOR"] as const;

export async function checkMutationRole(): Promise<
  { session: Session; error: null } | { session: null; error: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return { session: null, error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }
  if (!(MUTATION_ROLES as readonly string[]).includes(session.rol)) {
    return { session: null, error: NextResponse.json({ error: "Sin permiso para esta operación" }, { status: 403 }) };
  }
  return { session, error: null };
}
