/**
 * CLI: dispara manualmente el cron de warnings de cuotas.
 *
 * Uso:
 *   npm run warnings:tick
 *   npm run warnings:tick -- --dry  (no implementado todavía; placeholder)
 *
 * Sirve para staging sin cron y para validar en local.
 */
import { runDailyWarnings } from "../src/server/services/cuota-warnings.service";

async function main() {
  console.log("[warnings] starting daily run…");
  const summary = await runDailyWarnings();
  console.log("[warnings] result:");
  console.log(JSON.stringify(summary, null, 2));
  if (summary.errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[warnings] fatal:", err);
  process.exit(1);
});
