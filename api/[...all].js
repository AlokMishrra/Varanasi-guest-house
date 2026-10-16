/**
 * Vercel serverless entry point — every /api/* request lands here.
 *
 * One function on purpose: the Hobby plan allows at most 12 functions per
 * deployment, and a single entry point keeps the project well clear of that
 * limit while the per-endpoint files would not.
 *
 * Routing still happens in lib/api.js using req.url, so the same handler
 * serves every endpoint (and the local server uses it too).
 */
const { URL } = require("url");

let api = null;
let loadError = null;
function load() {
  if (api || loadError) return;
  try {
    api = require("../lib/api.js");
  } catch (err) {
    loadError = err;
  }
}

module.exports = async (req, res) => {
  if (res.setHeader) res.setHeader("X-Content-Type-Options", "nosniff");
  load();
  if (loadError) {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        error: "Function failed to start",
        detail: String((loadError && loadError.message) || loadError),
      })
    );
    return;
  }
  let url;
  try {
    url = new URL(req.url || "/api/", "https://localhost");
  } catch {
    url = new URL("/api/", "https://localhost");
  }
  try {
    await api.handleApi(req, res, url);
  } catch (err) {
    console.error("API error:", err);
    if (!res.headersSent) api.sendJson(res, 500, { error: (err && err.message) || "Server error" });
    else {
      try { res.end(); } catch { /* ignore */ }
    }
  }
};