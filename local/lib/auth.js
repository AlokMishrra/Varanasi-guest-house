/**
 * Admin sign-in sessions.
 *
 * Serverless hosts run many isolated copies of the code with no shared
 * memory, so tokens are stored in the `admin_sessions` table. When
 * Supabase is not configured (plain local use) it falls back to memory,
 * exactly like before.
 */
const crypto = require("crypto");
const sb = require("./supabase.js");

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const memory = new Map(); // token -> expiry ms

let lastPrune = 0;
async function prune() {
  const now = Date.now();
  if (now - lastPrune < 60 * 60 * 1000) return;
  lastPrune = now;
  for (const [token, expiry] of memory) {
    if (expiry < now) memory.delete(token);
  }
  if (sb.configured) {
    await sb
      .remove("admin_sessions", `expires_at=lt.${new Date(now).toISOString()}`)
      .catch(() => {});
  }
}

function memoryValid(token) {
  const exp = memory.get(token);
  if (!exp) return false;
  if (exp < Date.now()) {
    memory.delete(token);
    return false;
  }
  memory.set(token, Date.now() + TTL_MS);
  return true;
}

async function create() {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  if (sb.configured) {
    try {
      await sb.upsert("admin_sessions", [{ token, expires_at: expiresAt }], "token");
    } catch {
      memory.set(token, Date.now() + TTL_MS);
    }
  } else {
    memory.set(token, Date.now() + TTL_MS);
  }
  prune().catch(() => {});
  return token;
}

async function valid(token) {
  if (!token) return false;
  if (!sb.configured) return memoryValid(token);
  try {
    const rows = await sb.select(
      "admin_sessions",
      `select=expires_at&token=eq.${encodeURIComponent(token)}&limit=1`
    );
    if (rows && rows.length) {
      if (new Date(rows[0].expires_at).getTime() < Date.now()) {
        await sb.remove("admin_sessions", `token=eq.${encodeURIComponent(token)}`).catch(() => {});
        return false;
      }
      await sb
        .update(
          "admin_sessions",
          `token=eq.${encodeURIComponent(token)}`,
          { expires_at: new Date(Date.now() + TTL_MS).toISOString() }
        )
        .catch(() => {});
      return true;
    }
  } catch {
    /* database hiccup — fall through to the memory copy */
  }
  return memoryValid(token);
}

async function destroy(token) {
  if (!token) return;
  memory.delete(token);
  if (sb.configured) {
    await sb.remove("admin_sessions", `token=eq.${encodeURIComponent(token)}`).catch(() => {});
  }
}

/** Forget every session (used after a password change). */
async function clear() {
  memory.clear();
  if (sb.configured) {
    await sb.remove("admin_sessions", "created_at=not.is.null").catch(() => {});
  }
}

module.exports = { create, valid, destroy, clear };