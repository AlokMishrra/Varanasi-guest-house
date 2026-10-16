/**
 * Soak test — drives the server the way a real admin session would and
 * reports if (and when) the process dies.
 *
 *   node scripts/soak.js [minutes]
 */
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");

const MINUTES = Number(process.argv[2]) || 3;
const BASE = "http://localhost:3000";
const PORT = Number(process.env.PORT) || 3100;

let cookie = "";

async function api(path, opts = {}) {
  const res = await fetch(BASE + "/api/" + path, {
    method: opts.method || "GET",
    headers: Object.assign(cookie ? { cookie } : {}, opts.body ? { "Content-Type": "application/json" } : {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  return { status: res.status, body: await res.json().catch(() => null) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log(`\nSoak test: ${MINUTES} minutes against port ${PORT}\n`);
  const out = fs.openSync("/tmp/soak-server.log", "w");
  const server = spawn("node", ["local/api/server.js"], {
    cwd: require("path").join(__dirname, ".."),
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: ["ignore", out, out],
  });

  let exited = null;
  server.on("exit", (code, signal) => { exited = { code, signal, at: Date.now() }; });

  const BASE_URL = `http://localhost:${PORT}`;
  const call = async (path, opts = {}) => {
    const res = await fetch(BASE_URL + path, {
      method: opts.method || "GET",
      headers: Object.assign(cookie ? { cookie } : {}, opts.body ? { "Content-Type": "application/json" } : {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const sc = res.headers.get("set-cookie");
    if (sc) cookie = sc.split(";")[0];
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body };
  };

  await sleep(1800);

  const stats = { ok: 0, fail: 0, errors: new Map() };
  const note = (err) => {
    const k = String(err.message || err).slice(0, 70);
    stats.errors.set(k, (stats.errors.get(k) || 0) + 1);
  };

  const endAt = Date.now() + MINUTES * 60000;
  let cycle = 0;

  while (Date.now() < endAt && !exited) {
    cycle++;
    try {
      let r = await call("/api/session", { method: "POST", body: { username: "admin", password: "varanasi123" } });
      r.status === 200 ? stats.ok++ : (stats.fail++, note(new Error("login " + r.status)));

      r = await call("/api/content");
      r.status === 200 ? stats.ok++ : (stats.fail++, note(new Error("content " + r.status)));
      const content = r.body;

      r = await call("/api/bookings");
      r.status === 200 ? stats.ok++ : (stats.fail++, note(new Error("bookings " + r.status)));

      r = await call("/api/enquiries");
      r.status === 200 ? stats.ok++ : (stats.fail++, note(new Error("enquiries " + r.status)));

      r = await call("/api/media");
      r.status === 200 ? stats.ok++ : (stats.fail++, note(new Error("media " + r.status)));

      // public form submissions, like a guest booking
      r = await call("/api/submit", {
        method: "POST",
        body: { kind: "booking", name: "Soak Guest", phone: "9000000000", room: "Deluxe Room", checkin: "2026-12-01", checkout: "2026-12-03", nights: 2, amount: 3600 },
      });
      r.status === 200 ? stats.ok++ : (stats.fail++, note(new Error("submit " + r.status)));

      // a save, the heaviest operation
      const edited = JSON.parse(JSON.stringify(content));
      edited.rooms[0].price = 1800 + (cycle % 7);
      r = await call("/api/content", { method: "PUT", body: edited });
      r.status === 200 ? stats.ok++ : (stats.fail++, note(new Error("save " + r.status)));

      r = await call("/api/stats");
      r.status === 200 ? stats.ok++ : (stats.fail++, note(new Error("stats " + r.status)));

      // static assets
      for (const f of ["/", "/admin.html", "/assets/site.css", "/assets/admin.js"]) {
        const res = await fetch(BASE_URL + f).catch((e) => { note(e); return null; });
        if (res && res.status === 200) stats.ok++; else { stats.fail++; note(new Error("static " + f + " " + (res && res.status))); }
        if (res) await res.text();
      }

      // clean up the soak bookings so the database does not fill up
      const list = await call("/api/bookings");
      for (const b of (list.body.items || []).filter((x) => x.name === "Soak Guest")) {
        await call("/api/bookings/" + encodeURIComponent(b.id), { method: "DELETE" });
      }

      process.stdout.write(`  cycle ${cycle}: ok=${stats.ok} fail=${stats.fail}\r`);
    } catch (err) {
      stats.fail++;
      note(err);
      process.stdout.write(`  cycle ${cycle}: ERROR ${err.message}          \r`);
    }
    await sleep(400);
  }

  console.log(`\n\n  cycles           : ${cycle}`);
  console.log(`  successful calls : ${stats.ok}`);
  console.log(`  failed calls     : ${stats.fail}`);
  if (stats.errors.size) {
    console.log("  errors:");
    for (const [k, v] of stats.errors) console.log(`     ${v}x  ${k}`);
  }
  if (exited) {
    console.log(`\n  SERVER DIED after ${((exited.at - (endAt - MINUTES * 60000)) / 1000).toFixed(0)}s  code=${exited.code} signal=${exited.signal}`);
  } else {
    console.log(`\n  server survived the full ${MINUTES} minutes`);
  }

  // restore demo content through the test server
  await call("/api/content/reset", { method: "POST" }).catch(() => {});
  server.kill("SIGTERM");
  await sleep(400);
  process.exit(exited ? 1 : 0);
})();