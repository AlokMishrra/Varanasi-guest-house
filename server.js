/**
 * Siddhivinayak Temple Guesthouse — website + admin backend
 *
 * Storage: Supabase (Postgres + Storage). A local JSON mirror is kept as a
 * fallback so the site still works if the network drops.
 *
 * Run with:  node server.js
 */
const http = require("http");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const store = require("./lib/store.js");
const sb = require("./lib/supabase.js");

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
const MAX_UPLOAD = Number(process.env.MAX_UPLOAD) || 50 * 1024 * 1024; // 50 MB
const SERVER_STARTED_AT = new Date().toISOString();

/* ------------------------------------------------------------------ auth */

const DEFAULT_AUTH = { username: "admin", password: "varanasi123" };
const sessions = new Map(); // token -> expiry

function makeToken() {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, Date.now() + 1000 * 60 * 60 * 24 * 30);
  return token;
}
function sessionValid(token) {
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp) return false;
  if (exp < Date.now()) {
    sessions.delete(token);
    return false;
  }
  sessions.set(token, Date.now() + 1000 * 60 * 60 * 24 * 30);
  return true;
}
function cookieToken(req) {
  const raw = req.headers.cookie || "";
  const match = raw.split(";").map((c) => c.trim()).find((c) => c.startsWith("vgh_session="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

/* Expired sessions would otherwise pile up forever. */
const sessionSweeper = setInterval(() => {
  const now = Date.now();
  let removed = 0;
  for (const [token, expiry] of sessions) {
    if (expiry < now) { sessions.delete(token); removed++; }
  }
  if (removed) console.log(`[cleanup] removed ${removed} expired session(s)`);
}, 15 * 60 * 1000);
sessionSweeper.unref();
const hash = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/* --------------------------------------------------------------- helpers */

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

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store"
  });
  res.end(payload);
}

function readBody(req, limit = MAX_UPLOAD) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

const EXT_BY_MIME = {
  "image/png": ".png", "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/gif": ".gif",
  "image/webp": ".webp", "image/avif": ".avif", "image/svg+xml": ".svg",
  "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov",
  "video/x-m4v": ".m4v", "application/pdf": ".pdf"
};

function safeName(name) {
  return path
    .basename(name || "file", path.extname(name || ""))
    .replace(/[^a-z0-9._-]/gi, "-")
    .slice(0, 40) || "file";
}

/** Accepts { dataUrl, name } or { url } and stores the file. */
async function storeUpload(file) {
  if (!file) return null;
  if (typeof file === "string") return file;
  if (file.url) return file.url;
  if (typeof file.dataUrl !== "string" || !file.dataUrl.startsWith("data:")) return null;

  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(file.dataUrl);
  if (!match) return null;
  const mime = match[1];
  const buffer = match[2]
    ? Buffer.from(match[3], "base64")
    : Buffer.from(decodeURIComponent(match[3]), "utf8");
  if (!buffer.length) return null;

  const filename =
    Date.now().toString(36) + "-" + crypto.randomBytes(3).toString("hex") + "-" +
    safeName(file.name || "file") + (EXT_BY_MIME[mime] || path.extname(file.name || ""));
  const saved = await store.saveMedia(buffer, filename, mime);
  return saved.url;
}

/** Deep-walk a payload, persisting every upload and replacing it with its URL. */
async function resolveUploads(payload) {
  if (Array.isArray(payload)) {
    for (let i = 0; i < payload.length; i++) payload[i] = await resolveUploads(payload[i]);
    return payload;
  }
  if (payload && typeof payload === "object") {
    for (const key of Object.keys(payload)) {
      const value = payload[key];
      if (
        value && typeof value === "object" && !Array.isArray(value) &&
        typeof value.dataUrl === "string"
      ) {
        const stored = await storeUpload(value);
        payload[key] = stored === null ? value.url || "" : stored;
      } else {
        payload[key] = await resolveUploads(value);
      }
    }
    return payload;
  }
  return payload;
}

/** mtime-based version token, so a changed file always gets a new URL. */
const versionCache = new Map();
function versionOf(absPath, mtimeMs) {
  const key = absPath;
  const hit = versionCache.get(key);
  if (hit && hit.mtime === mtimeMs) return hit.v;
  const v = String(Math.floor(mtimeMs)).slice(-9);
  versionCache.set(key, { mtime: mtimeMs, v });
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

const newId = () => Date.now().toString(36) + crypto.randomBytes(3).toString("hex");

/* ----------------------------------------------------------------- routes */

async function handleApi(req, res, url) {
  const p = url.pathname.replace(/^\/api\/?/, "");
  const authed = sessionValid(cookieToken(req));

  const requireAuth = () => {
    if (authed) return false;
    sendJson(res, 401, { error: "Not signed in" });
    return true;
  };

  /* ---- health / storage status ---- */
  if (p === "health" && req.method === "GET") {
    const mem = process.memoryUsage();
    return sendJson(res, 200, {
      ok: true,
      storage: store.usingSupabase ? "supabase" : "local",
      project: store.supabaseRef || null,
      bucket: store.usingSupabase ? sb.bucket : null,
      startedAt: SERVER_STARTED_AT,
      uptimeSec: Math.floor(process.uptime()),
      node: process.version,
      memoryMB: Math.round(mem.rss / 1048576)
    });
  }

  /* ---- session ---- */
  if (p === "session" && req.method === "GET") {
    const auth = await store.getAuth();
    return sendJson(res, 200, { authenticated: authed, username: auth.username });
  }

  if (p === "session" && req.method === "POST") {
    const body = await readBody(req, 1e6);
    const auth = await store.getAuth();
    const ok =
      timingSafeEqual(hash(body.username || ""), hash(auth.username || DEFAULT_AUTH.username)) &&
      timingSafeEqual(hash(body.password || ""), hash(auth.password || DEFAULT_AUTH.password));
    if (!ok) return sendJson(res, 401, { error: "Invalid username or password" });
    const token = makeToken();
    res.setHeader(
      "Set-Cookie",
      `vgh_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
    );
    return sendJson(res, 200, { ok: true, token, username: auth.username });
  }

  if (p === "session" && req.method === "DELETE") {
    sessions.delete(cookieToken(req));
    res.setHeader("Set-Cookie", "vgh_session=; Path=/; HttpOnly; Max-Age=0");
    return sendJson(res, 200, { ok: true });
  }

  /* ---- credentials ---- */
  if (p === "credentials" && req.method === "POST") {
    if (requireAuth()) return;
    const body = await readBody(req, 1e6);
    const auth = await store.getAuth();
    if (body.currentPassword && !timingSafeEqual(hash(body.currentPassword), hash(auth.password))) {
      return sendJson(res, 400, { error: "Current password is incorrect" });
    }
    const next = {
      username: body.username ? String(body.username).trim() : auth.username,
      password: body.newPassword ? String(body.newPassword) : auth.password
    };
    await store.saveAuth(next);
    if (body.newPassword) sessions.clear();
    return sendJson(res, 200, { ok: true, restart: Boolean(body.newPassword) });
  }

  /* ---- content ---- */
  if (p === "content" && req.method === "GET") {
    return sendJson(res, 200, await store.getContent());
  }

  if (p === "content" && req.method === "PUT") {
    if (requireAuth()) return;
    const body = await resolveUploads(await readBody(req));
    await store.writeContent(body);
    return sendJson(res, 200, { ok: true, savedAt: new Date().toISOString() });
  }

  if (p === "content/reset" && req.method === "POST") {
    if (requireAuth()) return;
    await store.resetContent();
    return sendJson(res, 200, { ok: true });
  }

  /* ---- media library ---- */
  if (p === "media" && req.method === "GET") {
    if (requireAuth()) return;
    return sendJson(res, 200, { items: await store.listMedia() });
  }

  if (p === "media" && req.method === "POST") {
    if (requireAuth()) return;
    const body = await readBody(req);
    const files = Array.isArray(body.files) ? body.files : [body.file].filter(Boolean);
    const urls = [];
    for (const f of files) {
      const url = await storeUpload(f);
      if (url) urls.push(url);
    }
    return sendJson(res, 200, { ok: true, urls });
  }

  if (p.startsWith("media/") && req.method === "DELETE") {
    if (requireAuth()) return;
    const name = decodeURIComponent(p.slice("media/".length));
    if (!name || name.includes("..") || name.includes("/")) {
      return sendJson(res, 400, { error: "Bad file name" });
    }
    await store.deleteMedia(name);
    return sendJson(res, 200, { ok: true });
  }

  /* ---- bookings ---- */
  if (p === "bookings" && req.method === "GET") {
    if (requireAuth()) return;
    return sendJson(res, 200, { items: await store.listSubmissions("bookings") });
  }

  if (p === "bookings" && req.method === "PUT") {
    if (requireAuth()) return;
    const body = await readBody(req, 1e6);
    return sendJson(res, 200, { ok: true, items: await store.patchSubmission("bookings", body.id, body) });
  }

  if (p.startsWith("bookings/") && req.method === "DELETE") {
    if (requireAuth()) return;
    await store.deleteSubmission("bookings", decodeURIComponent(p.slice("bookings/".length)));
    return sendJson(res, 200, { ok: true });
  }

  /* ---- enquiries ---- */
  if (p === "enquiries" && req.method === "GET") {
    if (requireAuth()) return;
    return sendJson(res, 200, { items: await store.listSubmissions("enquiries") });
  }

  if (p === "enquiries" && req.method === "PUT") {
    if (requireAuth()) return;
    const body = await readBody(req, 1e6);
    return sendJson(res, 200, { ok: true, items: await store.patchSubmission("enquiries", body.id, body) });
  }

  if (p.startsWith("enquiries/") && req.method === "DELETE") {
    if (requireAuth()) return;
    await store.deleteSubmission("enquiries", decodeURIComponent(p.slice("enquiries/".length)));
    return sendJson(res, 200, { ok: true });
  }

  /* ---- public form submissions ---- */
  if (p === "submit" && req.method === "POST") {
    const body = await readBody(req, 2e6);
    if (String(body.company || "").trim()) return sendJson(res, 200, { ok: true }); // honeypot
    const name = String(body.name || "").trim();
    const contact = String(body.phone || body.email || "").trim();
    if (!name || !contact) return sendJson(res, 400, { error: "Name and phone/email are required" });

    const record = {
      id: newId(),
      kind: body.kind || "general",
      name,
      phone: String(body.phone || "").trim(),
      email: String(body.email || "").trim(),
      subject: String(body.subject || "").trim(),
      room: String(body.room || "").trim(),
      checkin: String(body.checkin || "").trim(),
      checkout: String(body.checkout || "").trim(),
      guests: String(body.guests || "").trim(),
      nights: body.nights != null ? Number(body.nights) : null,
      amount: body.amount != null ? Number(body.amount) : null,
      plan: String(body.plan || "").trim(),
      travellers: String(body.travellers || "").trim(),
      interests: String(body.interests || "").trim(),
      message: String(body.message || "").trim(),
      source: String(body.source || "website").trim(),
      status: "new",
      created_at: new Date().toISOString()
    };

    await store.addSubmission(record.kind === "booking" ? "bookings" : "enquiries", record);
    return sendJson(res, 200, { ok: true, id: record.id });
  }

  /* ---- dashboard stats ---- */
  if (p === "stats" && req.method === "GET") {
    if (requireAuth()) return;
    const [bookings, enquiries, content] = await Promise.all([
      store.listSubmissions("bookings"),
      store.listSubmissions("enquiries"),
      store.getContent(),
    ]);
    const dayAgo = Date.now() - 86400000;
    const isNew = (r) => r.status === "new";
    return sendJson(res, 200, {
      storage: store.usingSupabase ? "supabase" : "local",
      bookings: bookings.length,
      newBookings: bookings.filter(isNew).length,
      enquiries: enquiries.length,
      newEnquiries: enquiries.filter(isNew).length,
      recentBookings: bookings.slice(0, 5),
      recentEnquiries: enquiries.slice(0, 5),
      rooms: (content.rooms || []).length,
      offers: (content.offers || []).length,
      gallery: (content.gallery || []).length,
      plans: (content.travelPlans || []).length,
      testimonials: (content.testimonials || []).length,
      last7: Array.from({ length: 7 }, (_, i) => {
        const day = new Date();
        day.setDate(day.getDate() - (6 - i));
        const key = day.toISOString().slice(0, 10);
        return {
          date: key,
          count:
            bookings.filter((b) => String(b.created_at).slice(0, 10) === key).length +
            enquiries.filter((e) => String(e.created_at).slice(0, 10) === key).length,
        };
      }),
      last24h: [...bookings, ...enquiries].filter((r) => new Date(r.created_at).getTime() > dayAgo).length,
    });
  }

  /* ---- backup ---- */
  if (p === "backup" && req.method === "GET") {
    if (requireAuth()) return;
    return sendJson(res, 200, {
      content: await store.getContent(),
      bookings: await store.listSubmissions("bookings"),
      enquiries: await store.listSubmissions("enquiries"),
      exportedAt: new Date().toISOString()
    });
  }

  if (p === "backup" && req.method === "POST") {
    if (requireAuth()) return;
    const body = await resolveUploads(await readBody(req));
    if (body.content) await store.writeContent(body.content);
    for (const [table, rows] of [["bookings", body.bookings], ["enquiries", body.enquiries]]) {
      if (!Array.isArray(rows)) continue;
      for (const r of rows) {
        await store.patchSubmission(table, r.id, r).catch(() => {});
      }
    }
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: "Unknown API endpoint" });
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
  const store_ = store.usingSupabase ? "Supabase" : "local JSON (no Supabase keys)";
  console.log(`\n  Siddhivinayak Temple Guesthouse`);
  console.log(`  ---------------------------------------------`);
  console.log(`  Website  ->  http://localhost:${PORT}/`);
  console.log(`  Admin    ->  http://localhost:${PORT}/admin.html`);
  console.log(`  Storage  ->  ${store_}${store.supabaseRef ? " (" + store.supabaseRef + ")" : ""}`);
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