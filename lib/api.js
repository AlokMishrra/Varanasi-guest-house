/**
 * Shared API layer — used by BOTH hosts:
 *   - local-server.js      (long-running Node server, local use)
 *   - api/[...all].js      (Vercel serverless functions, cloud use)
 *
 * The handler speaks plain Node (req, res) so both hosts can call it.
 * Sign-in sessions live in the database (lib/auth.js) because serverless
 * hosts run many isolated copies with no shared memory.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const store = require("./store.js");
const sb = require("./supabase.js");
const sessionStore = require("./auth.js");

const ROOT = path.join(__dirname, "..");

// Local mirrors are only useful on a machine with a writable disk. On
// serverless hosts the bundle has no data/ or uploads/ folder and must not
// try to create one, so it only runs when a local server is present.
if (fs.existsSync(path.join(ROOT, "local"))) {
  for (const dir of ["data", "uploads"]) {
    try { fs.mkdirSync(path.join(ROOT, dir), { recursive: true }); } catch { /* read-only host */ }
  }
}
const MAX_UPLOAD = Number(process.env.MAX_UPLOAD) || 50 * 1024 * 1024; // 50 MB
const SERVER_STARTED_AT = new Date().toISOString();

/* ------------------------------------------------------------------ auth */

const DEFAULT_AUTH = { username: "admin", password: "varanasi123" };
const sessions = new Map(); // token -> expiry

function cookieToken(req) {
  const raw = req.headers.cookie || "";
  const match = raw.split(";").map((c) => c.trim()).find((c) => c.startsWith("vgh_session="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}
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
  if (req.body !== undefined) {
    // Already parsed by the host (e.g. Vercel serverless functions).
    return Promise.resolve(
      (function () {
        if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
        return req.body || {};
      })()
    ).catch(() => { throw new Error("Invalid JSON body"); });
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("Payload too large"));
        if (req.destroy) req.destroy();
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

const newId = () => Date.now().toString(36) + crypto.randomBytes(3).toString("hex");

/* ----------------------------------------------------------------- routes */

async function handleApi(req, res, url) {
  const p = url.pathname.replace(/^\/api\/?/, "");

  /*
   * Identifiers arrive as query parameters, not as extra path segments:
   *
   *   DELETE /api/media?name=photo.jpg
   *   DELETE /api/bookings?id=abc123
   *   POST   /api/content?action=reset
   *
   * Vercel resolves nested paths such as /api/media/photo.jpg as a static
   * file lookup and answers 404 itself, so the function never runs and
   * nothing is ever deleted. Query strings bypass that routing entirely.
   * The old path form is still accepted below for local use.
   */
  const q = url.searchParams;
  const pathTail = (prefix) => (p.startsWith(prefix) ? p.slice(prefix.length) : "");
  const authed = await sessionStore.valid(cookieToken(req));

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
    const token = await sessionStore.create();
    res.setHeader(
      "Set-Cookie",
      `vgh_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
    );
    return sendJson(res, 200, { ok: true, token, username: auth.username });
  }

  if (p === "session" && req.method === "DELETE") {
    await sessionStore.destroy(cookieToken(req));
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
    if (body.newPassword) await sessionStore.clear();
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

  if ((p === "content/reset" || (p === "content" && q.get("action") === "reset")) &&
      req.method === "POST") {
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

  if ((p === "media" || p.startsWith("media/")) && req.method === "DELETE") {
    if (requireAuth()) return;
    const raw = q.get("name") || pathTail("media/");
    const name = decodeURIComponent(raw || "");
    if (!name || name.includes("..") || name.includes("/")) {
      return sendJson(res, 400, { error: "Bad file name" });
    }
    await store.deleteMedia(name);
    return sendJson(res, 200, { ok: true, deleted: name });
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

  if ((p === "bookings" || p.startsWith("bookings/")) && req.method === "DELETE") {
    if (requireAuth()) return;
    const id = decodeURIComponent(q.get("id") || pathTail("bookings/"));
    if (!id) return sendJson(res, 400, { error: "Booking id is required" });
    await store.deleteSubmission("bookings", id);
    return sendJson(res, 200, { ok: true, deleted: id });
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

  if ((p === "enquiries" || p.startsWith("enquiries/")) && req.method === "DELETE") {
    if (requireAuth()) return;
    const id = decodeURIComponent(q.get("id") || pathTail("enquiries/"));
    if (!id) return sendJson(res, 400, { error: "Enquiry id is required" });
    await store.deleteSubmission("enquiries", id);
    return sendJson(res, 200, { ok: true, deleted: id });
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


module.exports = { handleApi, sendJson };
