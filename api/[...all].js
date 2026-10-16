/**
 * Vercel serverless entry point — every /api/* request lands here.
 *
 * The heavy lifting lives in lib/api.js (shared with server.js), so the
 * cloud and the local server always behave identically.
 *
 * Notes:
 * - Vercel pre-parses JSON bodies into req.body; lib/api.js prefers that
 *   and only reads the stream when it has to.
 * - Sign-in sessions live in the database (lib/auth.js) because serverless
 *   functions share no memory between invocations.
 * - File uploads arrive as base64 data URLs inside JSON. Hobby plans cap
 *   request bodies (~4.5 MB); larger clips should be uploaded straight to
 *   Supabase Storage instead.
 */
const { URL } = require("url");
const { handleApi, sendJson } = require("../lib/api.js");

module.exports = async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  try {
    const url = new URL(req.url, "https://localhost");
    await handleApi(req, res, url);
  } catch (err) {
    console.error("API error:", err);
    if (!res.headersSent) sendJson(res, 500, { error: err.message || "Server error" });
    else res.end();
  }
};