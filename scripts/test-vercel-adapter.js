/**
 * Exercises the Vercel adapter (api/[...all].js) with mock req/res objects,
 * against the real Supabase project. Proves the cloud path works before deploy.
 *
 *   node scripts/test-vercel-adapter.js
 */
const { URL } = require("url");

const handler = require("../api/[...all].js");

let pass = 0, fail = 0;
const C = { g: "\x1b[32m", r: "\x1b[31m", o: "\x1b[0m", b: "\x1b[1m" };

/** Minimal req/res doubles with a Node-compatible interface. */
function call(method, urlPath, { body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = {
      method,
      url: urlPath,
      headers: Object.assign(
        {},
        // simulate Vercel's pre-parsed JSON body on roughly half the calls
        cookie ? { cookie } : {}
      ),
    };
    // alternate between pre-parsed body (Vercel behavior) and raw stream
    const preparsed = Math.random() < 0.5;
    if (payload !== null) {
      if (preparsed) {
        req.body = JSON.parse(payload);
      } else {
        const { Readable } = require("stream");
        const stream = new Readable({ read() {} });
        Object.assign(req, stream, {
          on(e, fn) { stream.on(e, fn); return req; },
        });
        process.nextTick(() => {
          stream.push(Buffer.from(payload));
          stream.push(null);
        });
      }
      req.headers["content-type"] = "application/json";
    }

    const res = {
      statusCode: 200,
      headers: {},
      headersSent: false,
      body: "",
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      writeHead(s, h) { this.statusCode = s; Object.assign(this.headers, h || {}); },
      end(d) {
        this.headersSent = true;
        if (d) this.body += d;
        let json = null;
        try { json = this.body ? JSON.parse(this.body) : null; } catch { json = this.body; }
        resolve({ status: this.statusCode, headers: this.headers, body: json });
      },
    };

    // the adapter reads req.url — give it the full path
    req.url = urlPath;
    handler(req, res).catch(reject);
    setTimeout(() => reject(new Error("handler timed out: " + method + " " + urlPath)), 45000);
  });
}

async function check(label, fn) {
  try {
    const detail = await fn();
    pass++;
    console.log(`  ${C.g}✓${C.o} ${label}${detail ? "  " + detail : ""}`);
  } catch (err) {
    fail++;
    console.log(`  ${C.r}✗${C.o} ${label}  ${err.message}`);
  }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

(async () => {
  console.log(`\n${C.b}Vercel adapter test (mock req/res → real Supabase)${C.o}\n`);

  let cookie = "";
  let bookingId = null;

  await check("health answers", async () => {
    const r = await call("GET", "/api/health");
    assert(r.status === 200, "status " + r.status);
    assert(r.body.storage === "supabase", "storage=" + r.body.storage);
    return "storage=" + r.body.storage;
  });

  await check("private routes reject anonymous callers", async () => {
    for (const p of ["/api/bookings", "/api/enquiries", "/api/stats", "/api/media"]) {
      const r = await call("GET", p);
      assert(r.status === 401, p + " -> " + r.status);
    }
    return "4 endpoints 401";
  });

  await check("login works and sets the session cookie", async () => {
    const r = await call("POST", "/api/session", { body: { username: "admin", password: "varanasi123" } });
    assert(r.status === 200, "status " + r.status + " " + JSON.stringify(r.body));
    const setCookie = r.headers["set-cookie"] || "";
    assert(/vgh_session=/.test(setCookie), "no session cookie");
    cookie = String(setCookie).split(";")[0];
    return "cookie set";
  });

  await check("session persists across separate invocations", async () => {
    const r = await call("GET", "/api/session", { cookie });
    assert(r.body.authenticated === true, JSON.stringify(r.body));
  });

  await check("content reads", async () => {
    const r = await call("GET", "/api/content");
    assert(r.status === 200, "status " + r.status);
    assert((r.body.rooms || []).length >= 3, "rooms=" + (r.body.rooms || []).length);
    return r.body.rooms.length + " rooms";
  });

  await check("public booking submits", async () => {
    const r = await call("POST", "/api/submit", {
      body: { kind: "booking", name: "Vercel Adapter Test", phone: "9000000009", room: "Deluxe Room", checkin: "2026-12-05", checkout: "2026-12-06", nights: 1, amount: 1800 },
    });
    assert(r.status === 200, "status " + r.status + " " + JSON.stringify(r.body));
    bookingId = r.body.id;
  });

  await check("booking is listed", async () => {
    const r = await call("GET", "/api/bookings", { cookie });
    assert(r.body.items.some((b) => b.id === bookingId), "not listed");
  });

  await check("booking status updates", async () => {
    const r = await call("PUT", "/api/bookings", { cookie, body: { id: bookingId, status: "confirmed" } });
    assert(r.body.items.find((b) => b.id === bookingId).status === "confirmed", "not updated");
  });

  await check("booking deletes", async () => {
    const r = await call("DELETE", "/api/bookings/" + encodeURIComponent(bookingId), { cookie });
    assert(r.status === 200, "status " + r.status);
    const list = await call("GET", "/api/bookings", { cookie });
    assert(!list.body.items.some((b) => b.id === bookingId), "still listed");
  });

  await check("stats compute", async () => {
    const r = await call("GET", "/api/stats", { cookie });
    assert(r.status === 200 && typeof r.body.bookings === "number", "bad stats");
    return r.body.rooms + " rooms";
  });

  await check("media upload + list + delete", async () => {
    const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const up = await call("POST", "/api/media", { cookie, body: { file: { dataUrl: pixel, name: "adapter-test.png" } } });
    assert(up.status === 200 && up.body.urls.length, "upload failed: " + JSON.stringify(up.body));
    const list = await call("GET", "/api/media", { cookie });
    assert(list.body.items.some((i) => i.url === up.body.urls[0]), "not listed");
    const name = decodeURIComponent(up.body.urls[0].split("/").pop());
    const del = await call("DELETE", "/api/media/" + encodeURIComponent(name), { cookie });
    assert(del.status === 200, "delete failed");
    return up.body.urls[0].slice(0, 60) + "…";
  });

  await check("logout clears the session", async () => {
    const r = await call("DELETE", "/api/session", { cookie });
    assert(r.status === 200, "status " + r.status);
    const back = await call("GET", "/api/bookings", { cookie });
    assert(back.status === 401, "old cookie still works (" + back.status + ")");
  });

  await check("unknown endpoint 404s as JSON", async () => {
    const r = await call("GET", "/api/nope");
    assert(r.status === 404 && r.body && r.body.error, "status " + r.status);
  });

  console.log(`\n  ${C.b}TOTAL  ${pass}/${pass + fail} working${fail ? "  " + C.r + fail + " need attention" + C.o : "  " + C.g + "all clear" + C.o}\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("harness crashed:", e); process.exit(1); });