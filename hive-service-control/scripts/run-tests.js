// Cross-platform test runner for the dual Prisma schema setup.
// Always restores the Postgres schema/client after Vitest exits.

const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PRISMA_CLI = path.join(ROOT, "node_modules", "prisma", "build", "index.js");
const VITEST_CLI = path.join(ROOT, "node_modules", "vitest", "vitest.mjs");

function runSync(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  if (result.signal) return 1;
  return result.status ?? 1;
}

function runNodeScript(script, args) {
  return runSync(process.execPath, [script, ...args]);
}

function runPrisma(args) {
  return runSync(process.execPath, [PRISMA_CLI, ...args]);
}

function restoreSchema() {
  let code = runNodeScript("scripts/swap-schema.js", ["postgres"]);
  if (code !== 0) return code;
  code = runPrisma(["generate"]);
  return code;
}

async function main() {
  const mode = process.argv[2] === "watch" ? "watch" : "run";
  const passthroughArgs = process.argv.slice(3);

  let setupCode = runNodeScript("scripts/swap-schema.js", ["sqlite"]);
  if (setupCode === 0) setupCode = runPrisma(["generate"]);

  if (setupCode !== 0) {
    const restoreCode = restoreSchema();
    process.exit(restoreCode || setupCode);
  }

  const vitestArgs = mode === "watch" ? passthroughArgs : ["run", ...passthroughArgs];
  const child = spawn(process.execPath, [VITEST_CLI, ...vitestArgs], { stdio: "inherit" });

  const forwardSignal = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.once("SIGINT", forwardSignal);
  process.once("SIGTERM", forwardSignal);

  child.on("error", (err) => {
    console.error(err.message);
  });

  child.on("close", (code, signal) => {
    process.removeListener("SIGINT", forwardSignal);
    process.removeListener("SIGTERM", forwardSignal);

    const testCode = signal ? 1 : code ?? 1;
    const restoreCode = restoreSchema();
    process.exit(testCode || restoreCode);
  });
}

main().catch((err) => {
  console.error(err);
  const restoreCode = restoreSchema();
  process.exit(restoreCode || 1);
});
