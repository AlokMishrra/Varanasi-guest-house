/**
 * Shared Vercel adapter. Every file in api/ is a one-line re-export of
 * `handler`, so routing stays in the filesystem (where Vercel understands
 * it) and all logic stays in lib/api.js (shared with local-server.js).
 */
const { URL } = require("url");

let api = null;
let loadError = null;
function load() {
  if (api || loadError) return;
  try {
    api = require("./api.js");
  } catch (err) {
    loadError = err;
  }
}

/** Vercel passes the real request path in req.url, including dynamic segments. */
function handler(req, res) {
  if (res.setHeader) res.setHeader("X-Content-Type-Options", "nosniff");
  load();
  if (loadError || !api) {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        error: "Function failed to start",
        detail: String((loadError && loadError.message) || loadError || "unknown"),
      })
    );
    return Promise.resolve();
  }
  let url;
  try {
    url = new URL(req.url || "/api/", "https://localhost");
  } catch {
    url = new URL("/api/", "https://localhost");
  }
  return api.handleApi(req, res, url).catch((err) => {
    try {
      console.error("API error:", err);
    } catch { /* ignore */ }
    if (!res.headersSent) api.sendJson(res, 500, { error: (err && err.message) || "Server error" });
    else {
      try { res.end(); } catch { /* ignore */ }
    }
  });
}

module.exports = { handler };