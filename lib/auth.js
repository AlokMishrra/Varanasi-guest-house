/**
 * Admin sign-in sessions — stateless and signed.
 *
 * Serverless hosts run many isolated copies of the code with no shared
 * memory, so a token held in process memory (or even in a table) is lost
 * or unreachable between invocations: sign-in succeeds on one instance
 * and the very next request 401s on another.
 *
 * Instead the token *carries* its proof:
 *
 *     token = "<expiresAtMs>.<hmac-sha256(expiry|authFingerprint)>"
 *
 * Any instance can verify it with just the shared secret, so sign-in
 * survives cold starts, multiple regions and multiple running servers.
 *
 * Changing the password changes the fingerprint, which invalidates every
 * previously issued token automatically.
 */
const crypto = require("crypto");

const sb = require("./supabase.js");

const TTL_MS = Number(process.env.SESSION_TTL_DAYS || 7) * 24 * 60 * 60 * 1000;
const DEFAULT_AUTH = { username: "admin", password: "varanasi123" };

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const unb64url = (str) =>
  Buffer.from(String(str).replace(/-/g, "+").replace(/_/g, "/"), "base64");

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

/** The signing key. Uses the Supabase secret so it is stable across hosts. */
function signingKey() {
  return sb.configured ? sb.ref + ":" + process.env.SUPABASE_SECRET_KEY : "local:" + LOCAL_SECRET;
}
const LOCAL_SECRET =
  process.env.SESSION_SECRET ||
  crypto.randomBytes(32).toString("hex") + ":" + Date.now();

/** Changes whenever the credentials change → old tokens stop verifying. */
let fingerprintCache = { value: null, auth: null };

async function fingerprint() {
  const auth = await currentAuth();
  if (fingerprintCache.auth === JSON.stringify(auth)) return fingerprintCache.value;
  const value = sha256((auth && auth.username) + "|" + (auth && auth.password)).slice(0, 32);
  fingerprintCache = { value, auth: JSON.stringify(auth) };
  return value;
}

async function currentAuth() {
  try {
    const store = require("./store.js");
    const auth = await store.getAuth();
    return auth || DEFAULT_AUTH;
  } catch {
    return DEFAULT_AUTH;
  }
}

const sign = async (expiresAt) =>
  b64url(
    crypto
      .createHmac("sha256", signingKey())
      .update(String(expiresAt) + "." + (await fingerprint()))
      .digest()
  );

/** Create a session token that any instance can verify. */
async function create() {
  const expiresAt = Date.now() + TTL_MS;
  return String(expiresAt) + "." + (await sign(expiresAt));
}

/** Verify a token: correct signature and not expired. */
async function valid(token) {
  if (!token || typeof token !== "string") return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;

  const expiresAt = Number(token.slice(0, dot));
  const signature = token.slice(dot + 1);
  if (!Number.isFinite(expiresAt) || !signature) return false;
  if (expiresAt < Date.now()) return false;

  const expected = await sign(expiresAt);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Stateless tokens cannot be revoked individually, so signing out clears the
 * cookie (which is what actually logs the person out). A stolen token stays
 * usable until it expires, so the TTL is deliberately short (7 days) and
 * changing the password invalidates every outstanding token at once.
 */
async function destroy() {
  return;
}

/** No-op: changing the password already invalidates every token. */
async function clear() {
  fingerprintCache = { value: null, auth: null };
}

module.exports = { create, valid, destroy, clear };