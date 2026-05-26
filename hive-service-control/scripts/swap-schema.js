// Swap prisma/schema.prisma between Postgres (prod/dev) and SQLite (in-process tests).
//
// Uso:
//   node scripts/swap-schema.js sqlite     → activa schema SQLite, snapshot Postgres en .postgres.bak
//   node scripts/swap-schema.js postgres   → activa schema Postgres, snapshot SQLite en .sqlite.bak
//
// Idempotente: si ya está en el modo pedido, no hace nada.

const fs = require("node:fs");
const path = require("node:path");

const SCHEMA = path.resolve(__dirname, "..", "prisma", "schema.prisma");
const SQLITE_BAK = `${SCHEMA}.sqlite.bak`;
const POSTGRES_BAK = `${SCHEMA}.postgres.bak`;

const POSTGRES_DATASOURCE = `datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}`;

const SQLITE_DATASOURCE = `datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}`;

const mode = process.argv[2];
if (!["sqlite", "postgres"].includes(mode)) {
  console.error("Uso: node scripts/swap-schema.js <sqlite|postgres>");
  process.exit(1);
}

const current = fs.readFileSync(SCHEMA, "utf8");
const datasourceMatch = current.match(/datasource\s+db\s*\{[\s\S]*?\}/);
if (!datasourceMatch) {
  console.error("No se encontró datasource db en prisma/schema.prisma");
  process.exit(1);
}

const currentProvider = datasourceMatch[0].match(/provider\s*=\s*"([^"]+)"/)?.[1];
if (!currentProvider) {
  console.error("No se encontró provider en datasource db");
  process.exit(1);
}

if (currentProvider === "postgresql" && mode === "postgres") {
  console.log("schema ya es postgres");
  process.exit(0);
}
if (currentProvider === "sqlite" && mode === "sqlite") {
  console.log("schema ya es sqlite");
  process.exit(0);
}

// Snapshot del estado actual antes de cambiar.
if (currentProvider === "postgresql") {
  fs.writeFileSync(POSTGRES_BAK, current);
} else if (currentProvider === "sqlite") {
  fs.writeFileSync(SQLITE_BAK, current);
}

const replacement = mode === "sqlite" ? SQLITE_DATASOURCE : POSTGRES_DATASOURCE;
const swapped = current.replace(/datasource\s+db\s*\{[\s\S]*?\}/, replacement);
fs.writeFileSync(SCHEMA, swapped);

console.log(`schema → ${mode}`);
