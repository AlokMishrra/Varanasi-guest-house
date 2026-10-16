/**
 * Supabase client — PostgREST + Storage over HTTPS.
 *
 * Uses its own keep-alive agent with a capped socket pool instead of the
 * global fetch: a long-running server that keeps a session open would
 * otherwise exhaust the default pool and start failing with "fetch failed".
 *
 * No npm packages needed; Node 18+ only.
 */
const fs = require("fs");
const https = require("https");
const path = require("path");
const { URL } = require("url");

/* --------------------------------------------------------------- config */

function loadDotEnv(file) {
  const p = path.join(__dirname, "..", file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (/^["'].*["']$/.test(value)) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadDotEnv(".env");

const REF = process.env.SUPABASE_URL_REF || process.env.SUPABASE_REF || "";
const SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const BUCKET = process.env.SUPABASE_BUCKET || "media";

const TIMEOUT_MS = Number(process.env.SUPABASE_TIMEOUT) || 20000;
const MAX_RETRIES = Number(process.env.SUPABASE_RETRIES) || 3;
const CONCURRENCY = Number(process.env.SUPABASE_CONCURRENCY) || 6;

const HOST = REF ? `${REF}.supabase.co` : "";
const configured = Boolean(HOST && SERVICE_KEY);

/** Public URL for a file stored in the bucket. */
const publicUrl = (storagePath) =>
  BUCKET && storagePath
    ? `https://${REF}.supabase.co/storage/v1/object/public/${BUCKET}/${storagePath}`
    : "";

/* ------------------------------------------------------- http transport */

const agent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: CONCURRENCY,
  maxFreeSockets: 3,
  timeout: TIMEOUT_MS,
});

let inflight = 0;
const waiting = [];

function acquire() {
  if (inflight < CONCURRENCY) { inflight++; return Promise.resolve(); }
  return new Promise((resolve) => waiting.push(resolve));
}
function release() {
  const next = waiting.shift();
  if (next) next();
  else inflight--;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One HTTPS request. Rejects on network failure or timeout. */
function requestOnce(method, urlPath, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: HOST,
        port: 443,
        path: urlPath,
        method,
        agent,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            buffer: Buffer.concat(chunks),
          })
        );
      }
    );
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error("Supabase request timed out")));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

/** Request with a queue, bounded retries and backoff. */
async function request(method, urlPath, headers, body) {
  await acquire();
  try {
    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await requestOnce(method, urlPath, headers, body);
      } catch (err) {
        lastError = err;
        if (attempt < MAX_RETRIES) await sleep(200 * Math.pow(2, attempt));
      }
    }
    throw lastError;
  } finally {
    release();
  }
}

/**
 * Drop pooled sockets so a long-idle server never trips over stale ones.
 * Safe to call while requests are in flight: destroyed sockets surface as a
 * normal network error, which the retry loop above handles.
 */
function recycleSockets() {
  agent.destroy();
}

// Deliberately NOT run on a timer. Destroying sockets while requests are in
// flight causes avoidable failures, and keepAliveMsecs already closes idle
// sockets. Exposed so a deploy script can call it if it ever needs to.
const recycleTimer = null;

/* --------------------------------------------------------------- rest */

const headers = (extra) => {
  const h = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Length": 0,
  };
  return extra ? Object.assign(h, extra) : h;
};

async function rest(table, options = {}) {
  const urlPath = `/rest/v1/${table}${options.query ? "?" + options.query : ""}`;
  const hasBody = options.body != null;
  const res = await request(
    options.method || "GET",
    urlPath,
    headers(
      Object.assign(
        { "Content-Type": "application/json" },
        hasBody ? { "Content-Length": Buffer.byteLength(JSON.stringify(options.body)) } : {},
        options.headers || {}
      )
    ),
    hasBody ? JSON.stringify(options.body) : null
  );

  const text = res.buffer.toString("utf8");
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (res.status < 200 || res.status >= 300) {
    const msg =
      (data && (data.message || data.error_description || data.hint)) ||
      `Supabase request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.detail = data;
    throw err;
  }
  return data;
}

/* ------------------------------------------------------------- queries */

const select = (table, query) => rest(table, { query });
const insert = (table, rows) =>
  rest(table, { method: "POST", headers: { Prefer: "return=minimal" }, body: rows });
const upsert = (table, rows, onConflict) =>
  rest(table, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    query: onConflict ? `on_conflict=${encodeURIComponent(onConflict)}` : "",
    body: rows,
  });
const update = (table, query, patch) => rest(table, { method: "PATCH", query, body: patch });
const remove = (table, query) => rest(table, { method: "DELETE", query });

/* ------------------------------------------------------------- storage */

async function upload(storagePath, buffer, mime) {
  const res = await request(
    "POST",
    `/storage/v1/object/${BUCKET}/${storagePath}`,
    headers({ "Content-Type": mime || "application/octet-stream", "x-upsert": "true", "Content-Length": buffer.length }),
    buffer
  );
  if (res.status < 200 || res.status >= 300) {
    throw new Error("Upload failed: " + res.buffer.toString("utf8").slice(0, 200));
  }
  return storagePath;
}

async function deleteFile(storagePath) {
  await request("DELETE", `/storage/v1/object/${BUCKET}/${storagePath}`, headers(), null);
}

async function listFiles() {
  const res = await request(
    "POST",
    `/storage/v1/object/list/${BUCKET}`,
    headers({ "Content-Type": "application/json", "Content-Length": JSON.stringify({ prefix: "", limit: 1000 }).length }),
    JSON.stringify({ prefix: "", limit: 1000 })
  );
  if (res.status < 200 || res.status >= 300) return [];
  try {
    const json = JSON.parse(res.buffer.toString("utf8"));
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

/** Points the stored rows at the bucket that actually holds the files. */
function resolveUrls(rows) {
  return rows.map((r) => ({
    name: r.name,
    path: r.path,
    url: r.url && r.url.startsWith("http") ? r.url : publicUrl(r.path),
    mime: r.mime,
    type: r.mime || "application/octet-stream",
    size: Number(r.size) || 0,
    created_at: r.created_at,
  }));
}

/* -------------------------------------------------------------- health */

async function ping() {
  if (!configured) return { ok: false, reason: "keys not configured" };
  try {
    const res = await request("GET", "/rest/v1/", headers(), null);
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, reason: "HTTP " + res.status };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/** True once the tables exist (or not) — used by the setup checker. */
async function tablesReady() {
  const required = [
    "site_settings", "rooms", "gallery", "offers", "travel_plans",
    "testimonials", "attractions", "reviews", "bookings", "enquiries",
    "admin_users", "media",
  ];
  const missing = [];
  for (const t of required) {
    const res = await request("GET", `/rest/v1/${t}?select=*&limit=1`, headers(), null).catch(() => null);
    if (!res || res.status === 404 || res.status === 400) missing.push(t);
  }
  return { ready: missing.length === 0, missing };
}

module.exports = {
  configured,
  ref: REF,
  bucket: BUCKET,
  base: REF ? `https://${REF}.supabase.co` : "",
  anonKey: ANON_KEY,
  publicUrl,
  select,
  insert,
  upsert,
  update,
  remove,
  upload,
  deleteFile,
  listFiles,
  resolveUrls,
  ping,
  tablesReady,
  recycleSockets,
};