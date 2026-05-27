const { spawn } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const workerEntry = path.join(root, "src", "worker.ts");

const children = new Map();
let shuttingDown = false;

function startProcess(name, command, args, env = {}, optional = false) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  children.set(name, child);
  pipe(child.stdout, name);
  pipe(child.stderr, name);

  child.on("exit", (code, signal) => {
    children.delete(name);
    if (shuttingDown) return;

    const reason = signal ? `signal ${signal}` : `code ${code}`;
    if (optional) {
      console.warn(`[dev] ${name} stopped (${reason}). Optional process — app continues without it.`);
      return;
    }
    console.error(`[dev] ${name} stopped (${reason}). Stopping full local system.`);
    shutdown(code || 1);
  });

  return child;
}

function pipe(stream, name) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.trim()) console.log(`[${name}] ${line}`);
    }
  });
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const [name, child] of children) {
    if (!child.killed) {
      console.log(`[dev] stopping ${name}...`);
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => process.exit(exitCode), 800);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("[dev] Starting full local system");
console.log("[dev] App: http://localhost:3001");
console.log("[dev] Processing engine: internal process, visible in /admin/monitoreo");

startProcess("app", process.execPath, [nextBin, "dev", "-p", "3001"], {
  APP_URL: process.env.APP_URL || "http://localhost:3001",
});

startProcess(
  "engine",
  process.execPath,
  ["-r", "ts-node/register/transpile-only", "-r", "tsconfig-paths/register", workerEntry],
  {
    TS_NODE_COMPILER_OPTIONS: JSON.stringify({ module: "CommonJS", moduleResolution: "node" }),
    WORKER_UI: process.env.WORKER_UI || "0",
    APP_URL: process.env.APP_URL || "http://localhost:3001",
  },
  true, // optional: Redis may not be available in local dev
);
