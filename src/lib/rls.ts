import { Prisma } from "@prisma/client";
import { Role } from "@/lib/db-enums";
import { _prisma } from "@/lib/db/_client";

/**
 * Run a block of Prisma queries inside a transaction whose first statement
 * sets the per-request session variables that drive Postgres RLS:
 */
export async function withRls<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  // Dynamic import to avoid breaking standalone Node.js workers that don't have Next.js env
  const { auth } = await import("@/lib/auth");
  const session = await auth();
  const userId = session?.user.id ?? "";
  const userRole = session?.user.role ?? "";

  // SQLite migration: set_config() is Postgres-only. RLS is NOT enforced on
  // SQLite; the transaction is kept so query semantics match Postgres usage.
  void userId; void userRole;
  return _prisma.$transaction(async (tx) => {
    return fn(tx);
  }, {
    maxWait: 5000, // default is 2000
    timeout: 10000 // default is 5000
  });
}


/**
 * Server-side privileged escape hatch.
 */
export async function withSystemRls<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  void Role.SISTEMA_CUOTAS; // see SQLite note above
  return _prisma.$transaction(async (tx) => {
    return fn(tx);
  }, {
    maxWait: 5000,
    timeout: 10000
  });
}


