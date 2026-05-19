// PRIVATE — do not import from app code.
// The only legitimate consumer is src/lib/rls.ts (and auth/seed bootstrap paths
// where RLS doesn't apply: NextAuth credentials lookup runs without an
// authenticated session, so RLS would block it).
// Enforced by the no-restricted-imports rule in .eslintrc.json.

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  __prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
    datasources: {
      db: { url: process.env.DATABASE_URL },
    },
  });
}

export const _prisma = globalForPrisma.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.__prisma = _prisma;
