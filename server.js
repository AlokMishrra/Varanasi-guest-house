/**
 * Siddhivinayak Temple Guesthouse — website + admin backend (local use)
 *
 * Storage: Supabase (Postgres + Storage). A local JSON mirror is kept as a
 * fallback so the site still works if the network drops.
 *
 * Run with:  node server.js   (or: node scripts/run.js for auto-restart)
 */
const http = require("http");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { URL } = require("url");

const { handleApi, sendJson } = require("./lib/api.js");

/* --------------------------------------------------------------- guards */

let fatalLogged = 0;
process.on("unhandledRejection", (reason) => {
  console.error("[warn] unhandled promise rejection:", (reason && reason.message) || reason);
});
process.on("uncaughtException", (err) => {
  // A single bad request must never take the whole site offline. Log loudly
  // and keep serving.
  console.error("[error] uncaught exception:", err && err.stack ? err.stack : err);
  if (++fatalLogged > 50) {
    console.error("[fatal] too many errors, shutting down cleanly");
    process.exit(1);
  }
});

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const UPLOAD_DIR = path.join(ROOT, "uploads");
fs.mkdirSync(PUBLIC_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2"
};

/** mtime-based version token, so a changed file always gets a new URL. */
const versionCache = new Map();
function versionOf(absPath, mtimeMs) {
  const hit = versionCache.get(absPath);
  if (hit && hit.mtime === mtimeMs) return hit.v;
  const v = String(Math.floor(mtimeMs)).slice(-9);
  versionCache.set(absPath, { mtime: mtimeMs, v });
  return v;
}

/** Rewrite /assets/* references in an HTML document to carry ?v=… */
function versionAssets(html) {
  return html.replace(/(\/assets\/[\w.-]+\.(?:css|js))\?v=\d+/g, "$1").replace(
    /(["'])\/assets\/([\w.-]+\.(?:css|js))\1/g,
    (match, quote, file) => {
      const abs = path.join(ROOT, "assets", file);
      try {
        const st = fs.statSync(abs);
        return `${quote}/assets/${file}?v=${versionOf(abs, st.mtimeMs)}${quote}`;
      } catch {
        return match;
      }
    }
  );
}

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/") rel = "/index.html";

  for (const base of [PUBLIC_DIR, ROOT]) {
    const target = path.join(base, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
    if (!target.startsWith(base)) continue;
    try {
      const stat = await fsp.stat(target);
      if (stat.isDirectory()) continue;
      const ext = path.extname(target).toLowerCase();
      const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;

      if (req.headers["if-none-match"] === etag) {
        res.writeHead(304, { ETag: etag, "Cache-Control": "no-cache" });
        return true;
      }

      // HTML is rewritten on the fly so asset URLs always match the files on disk
      if (ext === ".html") {
        const html = versionAssets(await fsp.readFile(target, "utf8"));
        const buf = Buffer.from(html, "utf8");
        res.writeHead(200, {
          "Content-Type": MIME[".html"],
          "Content-Length": buf.length,
          ETag: etag,
          "Cache-Control": "no-cache",
        });
        res.end(buf);
        return true;
      }

      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Content-Length": stat.size,
        ETag: etag,
        "Cache-Control": "no-cache",
      });
      fs.createReadStream(target).pipe(res);
      return true;
    } catch {
      /* keep looking */
    }
  }
  return false;
}

/* ----------------------------------------------------------------- server */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  res.setHeader("X-Content-Type-Options", "nosniff");

  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    if (url.pathname === "/admin" || url.pathname === "/admin/") {
      res.writeHead(302, { Location: "/admin.html" });
      return res.end();
    }
    if (await serveStatic(req, res, url.pathname)) return;
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h1>404</h1><p>Not found. <a href='/'>Go home</a></p>");
  } catch (err) {
    console.error("Error:", err);
    if (!res.headersSent) sendJson(res, 500, { error: err.message || "Server error" });
    else res.end();
  }
});

server.listen(PORT, () => {
  const { usingSupabase, supabaseRef } = require("./lib/store.js");
  const store_ = usingSupabase ? "Supabase" : "local JSON (no Supabase keys)";
  console.log(`\n  Siddhivinayak Temple Guesthouse`);
  console.log(`  ---------------------------------------------`);
  console.log(`  Website  ->  http://localhost:${PORT}/`);
  console.log(`  Admin    ->  http://localhost:${PORT}/admin.html`);
  console.log(`  Storage  ->  ${store_}${supabaseRef ? " (" + supabaseRef + ")" : ""}`);
  console.log(`  Login    ->  admin / varanasi123  (change it in Settings)`);
  console.log(`  ---------------------------------------------\n`);
});

// Reject half-open / oversized requests instead of letting sockets pile up.
server.headersTimeout = 30000;
server.requestTimeout = 120000;
server.keepAliveTimeout = 65000;

server.on("clientError", (err, socket) => {
  if (socket && !socket.destroyed) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});
server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    // Port stolen by another process. Staying alive would look "running"
    // while serving nothing, so exit and let the service manager retry.
    console.error(`[fatal] port ${PORT} is already in use — exiting so the service manager retries`);
    setTimeout(() => process.exit(1), 200).unref();
    return;
  }
  console.error("[error] server:", err && err.message ? err.message : err);
});

process.on("SIGINT", () => {
  console.log("\n  Stopping…");
  process.exit(0);
});
process.on("SIGTERM", () => {
  process.exit(0);
});