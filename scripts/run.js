/**
 * Supervisor — runs the server and restarts it if it ever exits.
 *
 *   node scripts/run.js
 *
 * Use this instead of `node server.js` when you want the site to stay up:
 * a crash is recovered from automatically instead of leaving you with a
 * dead localhost.
 */
const { spawn } = require("child_process");
const path = require("path");

const SERVER = path.join(__dirname, "..", "server.js");
const MAX_FAST_RESTARTS = 5;   // avoid a crash loop
const FAST_RESTART_MS = 3000;
const RESTART_LOG = path.join(__dirname, "..", "logs", "restarts.log");

const fs = require("fs");
function logRestart(reason) {
  try {
    fs.mkdirSync(path.join(__dirname, "..", "logs"), { recursive: true });
    fs.appendFileSync(
      RESTART_LOG,
      `${new Date().toISOString()}  restart: ${reason}\n`
    );
  } catch { /* logging must never break supervision */ }
}

let restarts = 0;
let lastExit = Date.now();
let stopping = false;
let child = null;
let failures = 0;
let generation = 0;

/** Ask the server if it is alive. A running-but-deaf process is restarted. */
const http = require("http");
function healthCheck() {
  return new Promise((resolve) => {
    const port = Number(process.env.PORT) || 3000;
    const req = http.get(
      { host: "127.0.0.1", port, path: "/api/health", timeout: 8000 },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode === 200));
      }
    );
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
  });
}

async function watch(gen) {
  if (stopping || !child || gen !== generation) return;
  const alive = await healthCheck().catch(() => false);
  if (stopping || !child || gen !== generation) return;
  if (alive) {
    failures = 0;
  } else if (++failures >= 3) {
    console.error("\n  Server is not answering. Restarting it now…\n");
    logRestart("3 failed health checks in a row");
    failures = 0;
    try { child.kill("SIGKILL"); } catch { /* already gone */ }
    return; // the exit handler starts a fresh one
  }
  setTimeout(() => watch(gen), 15000).unref();
}

function start() {
  generation++;
  const gen = generation;
  child = spawn(process.execPath, [SERVER], {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
    env: process.env,
  });

  setTimeout(() => watch(gen), 15000).unref();

  child.on("exit", (code, signal) => {
    if (child && gen === generation) child = null;
    if (stopping) return;
    const ranFor = Date.now() - lastExit;
    const quick = ranFor < FAST_RESTART_MS;

    if (quick && ++restarts > MAX_FAST_RESTARTS) {
      console.error("\n  The server is crashing repeatedly (last exit code " + code + ").");
      console.error("  Stopping to avoid a restart loop. Check for an error above.\n");
      process.exit(1);
    }
    if (!quick) restarts = 0;

    lastExit = Date.now();
    logRestart(`exit (${signal || "code " + code})`);
    console.error(`\n  Server stopped (${signal || "code " + code}). Restarting in 2 seconds…\n`);
    setTimeout(start, 2000);
  });

  child.on("error", (err) => {
    console.error("  Could not start the server:", err.message);
    setTimeout(start, 2000);
  });
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    stopping = true;
    try { if (child) child.kill("SIGTERM"); } catch { /* already gone */ }
    setTimeout(() => process.exit(0), 500).unref();
  });
}

console.log("  Supervisor running — the server will restart itself if it stops.\n");
start();