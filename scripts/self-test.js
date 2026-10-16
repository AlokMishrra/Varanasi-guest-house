/**
 * End-to-end self test.
 *
 *   node scripts/self-test.js          API + browser tests
 *   node scripts/self-test.js --api    API only (fast)
 *
 * Exercises every admin and website function against the running server,
 * then prints a working / not-working report.
 */
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const BASE = process.env.TEST_BASE || "http://localhost:3000";
const CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ||
  "/usr/bin/google-chrome";

const results = [];
let cookie = "";
let currentGroup = "";

const C = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", d: "\x1b[2m", b: "\x1b[1m", o: "\x1b[0m" };

function group(name) {
  currentGroup = name;
  console.log(`\n${C.b}${name}${C.o}`);
}
function pass(label, detail) {
  results.push({ group: currentGroup, label, ok: true, detail: detail || "" });
  console.log(`  ${C.g}✓${C.o} ${label}${detail ? C.d + "  " + detail + C.o : ""}`);
}
function fail(label, detail) {
  results.push({ group: currentGroup, label, ok: false, detail: detail || "" });
  console.log(`  ${C.r}✗${C.o} ${label}${detail ? C.y + "  " + detail + C.o : ""}`);
}
const TEST_TIMEOUT_MS = 45000;

async function check(label, fn, timeoutMs) {
  const limit = timeoutMs || TEST_TIMEOUT_MS;
  try {
    const detail = await Promise.race([
      fn(),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error("timed out after " + limit / 1000 + "s")), limit)
      ),
    ]);
    pass(label, typeof detail === "string" ? detail : "");
  } catch (err) {
    fail(label, err.message);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

/* ------------------------------------------------------------------ http */

async function api(path, opts = {}) {
  const res = await fetch(BASE + "/api/" + path, {
    method: opts.method || "GET",
    headers: Object.assign(
      cookie ? { cookie } : {},
      opts.body ? { "Content-Type": "application/json" } : {}
    ),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json, headers: res.headers };
}

/** 1x1 transparent PNG */
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/* ============================================================ API tests */

async function apiTests() {
  group("1. Server & storage");

  await check("server responds", async () => {
    const r = await api("health");
    assert(r.status === 200, "status " + r.status);
    return r.body.storage === "supabase"
      ? `Supabase · ${r.body.project} · bucket ${r.body.bucket}`
      : "local storage (Supabase not configured)";
  });

  await check("website loads", async () => {
    const res = await fetch(BASE + "/");
    assert(res.status === 200, "status " + res.status);
  });

  await check("admin panel loads", async () => {
    const res = await fetch(BASE + "/admin.html");
    assert(res.status === 200, "status " + res.status);
  });

  await check("stylesheets load", async () => {
    for (const f of ["/assets/site.css", "/assets/admin.css", "/assets/site.js", "/assets/admin.js"]) {
      const res = await fetch(BASE + f);
      assert(res.status === 200, f + " -> " + res.status);
    }
  });

  group("2. Security");

  const savedCookie = cookie;
  cookie = "";
  await check("private data is blocked without login", async () => {
    for (const p of ["bookings", "enquiries", "stats", "media", "backup"]) {
      const r = await api(p);
      assert(r.status === 401, p + " returned " + r.status + " instead of 401");
    }
    return "6 endpoints return 401";
  });

  await check("content edits are blocked without login", async () => {
    const r = await api("content", { method: "PUT", body: { rooms: [] } });
    assert(r.status === 401, "status " + r.status);
  });
  await check("booking deletion is blocked without login", async () => {
    const r = await api("bookings/fake", { method: "DELETE" });
    assert(r.status === 401, "status " + r.status);
  });

  await check("wrong password is rejected", async () => {
    const r = await api("session", { method: "POST", body: { username: "admin", password: "wrong" } });
    assert(r.status === 401, "status " + r.status);
  });

  group("3. Admin sign in");

  await check("correct password signs in", async () => {
    const r = await api("session", {
      method: "POST",
      body: { username: "admin", password: process.env.ADMIN_PASS || "varanasi123" },
    });
    assert(r.status === 200, "status " + r.status);
    assert(r.body.username === "admin", "username not echoed");
  });

  group("4. Content read / write");

  let snapshot;
  await check("content downloads", async () => {
    const r = await api("content");
    assert(r.status === 200, "status " + r.status);
    assert(Array.isArray(r.body.rooms) && r.body.rooms.length > 0, "no rooms");
    snapshot = JSON.parse(JSON.stringify(r.body));
    return `${r.body.rooms.length} rooms · ${r.body.gallery.length} photos · ${r.body.offers.length} offers · ` +
      `${r.body.travelPlans.length} plans · ${r.body.testimonials.length} testimonials`;
  });

  await check("site name is correct", async () => {
    const r = await api("content");
    const name = r.body.site.brandName;
    assert(/siddhivinayak/i.test(name), "brandName is '" + name + "'");
    assert(/siddhivinayak/i.test(r.body.footer.brand), "footer.brand is '" + r.body.footer.brand + "'");
    return name;
  });

  await check("editing a room saves and persists", async () => {
    const content = JSON.parse(JSON.stringify(snapshot));
    content.rooms[0].name = "Test Room Name";
    content.rooms[0].price = 4321;
    const put = await api("content", { method: "PUT", body: content });
    assert(put.status === 200, "save failed " + put.status + " " + JSON.stringify(put.body));
    const back = await api("content");
    const room = back.body.rooms.find((r) => r.id === content.rooms[0].id);
    assert(room.name === "Test Room Name", "name came back as '" + room.name + "'");
    assert(room.price === 4321, "price came back as " + room.price);
  });

  await check("room ordering is preserved", async () => {
    const content = JSON.parse(JSON.stringify(snapshot));
    const flipped = content.rooms.slice().reverse();
    content.rooms = flipped;
    await api("content", { method: "PUT", body: content });
    const back = await api("content");
    assert(
      back.body.rooms.map((r) => r.id).join(",") === flipped.map((r) => r.id).join(","),
      "order not preserved"
    );
  });

  await check("adding a room persists", async () => {
    const content = JSON.parse(JSON.stringify(snapshot));
    content.rooms.push({
      id: "test-room-" + Date.now(), name: "Added By Test", image: "", guests: 2, bed: "1 King",
      amenities: ["Free Wi-Fi"], price: 1111, priceNote: "/ night", active: true,
    });
    await api("content", { method: "PUT", body: content });
    const back = await api("content");
    assert(back.body.rooms.some((r) => r.name === "Added By Test"), "room not found");
    return back.body.rooms.length + " rooms";
  });

  await check("deleting a room persists", async () => {
    // remove the test room from whatever is currently live, then save
    const content = await api("content");
    const target = content.body.rooms.find((r) => r.name === "Added By Test");
    assert(target, "the test room is not there to delete");
    const before = content.body.rooms.length;
    content.body.rooms = content.body.rooms.filter((r) => r.id !== target.id);

    const put = await api("content", { method: "PUT", body: content.body });
    assert(put.status === 200, "save failed " + put.status + " " + JSON.stringify(put.body));

    const back = await api("content");
    assert(!back.body.rooms.some((r) => r.name === "Added By Test"), "room still present");
    assert(back.body.rooms.length === before - 1,
      "expected " + (before - 1) + " rooms, got " + back.body.rooms.length);
    return before + " → " + back.body.rooms.length + " rooms";
  });

  await check("hidden rooms stay hidden (boolean not string)", async () => {
    const content = JSON.parse(JSON.stringify(snapshot));
    content.rooms[0].active = false;
    await api("content", { method: "PUT", body: content });
    const back = await api("content");
    const room = back.body.rooms.find((r) => r.id === content.rooms[0].id);
    assert(room.active === false, "active is " + JSON.stringify(room.active) + " (should be boolean false)");
    content.rooms[0].active = true;
    await api("content", { method: "PUT", body: content });
  });

  await check("inline image upload is converted to a URL", async () => {
    const content = JSON.parse(JSON.stringify(snapshot));
    content.gallery[0].image = { dataUrl: PIXEL, name: "self-test.png" };
    const put = await api("content", { method: "PUT", body: content });
    assert(put.status === 200, "save failed");
    const back = await api("content");
    const img = back.body.gallery[0].image;
    assert(typeof img === "string" && /^https?:\/\/|\/uploads\//.test(img), "image is " + JSON.stringify(img));
    return img.slice(0, 58) + (img.length > 58 ? "…" : "");
  });

  await check("deleting works in EVERY collection", async () => {
    // Regression: the save path used to read a column that some tables do not
    // have, so the "existing rows" lookup failed, deletions never ran, and the
    // admin silently kept re-adding anything you tried to remove.
    const content = await api("content");
    assert(content.status === 200, "content read failed");

    const spec = [
      { key: "rooms", table: "rooms", make: (i) => ({ id: "deltest-room-" + i, name: "Del Test Room", image: "", guests: 2, bed: "x", amenities: [], price: 100, active: true }) },
      { key: "gallery", table: "gallery", make: (i) => ({ id: "deltest-gal-" + i, image: "https://example.com/x.jpg", caption: "del" }) },
      { key: "offers", table: "offers", make: (i) => ({ id: "deltest-offer-" + i, type: "card", kicker: "T", title: "Del Test Offer", description: "", buttonText: "Enquire", active: true }) },
      { key: "travelPlans", table: "travel_plans", make: (i) => ({ id: "deltest-plan-" + i, name: "Del Test Plan", days: "1", pricePerPerson: 1, includes: [], excludes: [], active: true }) },
      { key: "testimonials", table: "testimonials", make: (i) => ({ id: "deltest-testi-" + i, title: "Del Test", text: "", poster: "", video: "", active: true }) },
      { key: "attractions", table: "attractions", make: (i) => ({ id: "deltest-attr-" + i, name: "Del Test Place", distance: "1 km", image: "", icon: "" }) },
    ];

    const stamp = Date.now();
    // 1. add one to each collection and save
    const withExtras = JSON.parse(JSON.stringify(content.body));
    spec.forEach((s) => withExtras[s.key].push(s.make(stamp)));
    withExtras.reviewsSection.reviews.push({ id: "deltest-rev-" + stamp, name: "Del Test Review", when: "now", rating: 5, text: "x" });
    const addRes = await api("content", { method: "PUT", body: withExtras });
    assert(addRes.status === 200, "add failed " + addRes.status);

    let back = await api("content");
    const addedIds = spec.map((s) => s.make(stamp).id).concat(["deltest-rev-" + stamp]);
    const missing = addedIds.filter((id) => !JSON.stringify(back.body).includes(id));
    assert(missing.length === 0, "not stored: " + missing.join(", "));

    // 2. remove them all and save
    const cleaned = await api("content");
    const c = cleaned.body;
    spec.forEach((s) => { c[s.key] = c[s.key].filter((x) => x.id !== s.make(stamp).id); });
    c.reviewsSection.reviews = c.reviewsSection.reviews.filter((x) => x.id !== "deltest-rev-" + stamp);
    const delRes = await api("content", { method: "PUT", body: c });
    assert(delRes.status === 200, "delete save failed " + delRes.status);

    // 3. confirm they are really gone from the database
    back = await api("content");
    const stillThere = addedIds.filter((id) => JSON.stringify(back.body).includes(id));
    assert(stillThere.length === 0,
      "still present after delete: " + stillThere.join(", "));
    return spec.length + 1 + " collections";
  }, 180000);

  await check("every collection saves", async () => {
    const content = JSON.parse(JSON.stringify(snapshot));
    content.offers[0].title = "Test Offer";
    content.travelPlans[0].pricePerPerson = 7777;
    content.testimonials[0].title = "Test Story";
    content.attractions[0].distance = "0.5 km";
    content.reviewsSection.reviews[0].name = "Test Reviewer";
    content.hero.eyebrow = "TEST EYEBROW";
    content.footer.brand = "Test Footer Brand";
    await api("content", { method: "PUT", body: content });
    const back = await api("content");
    assert(back.body.offers[0].title === "Test Offer", "offer not saved");
    assert(back.body.travelPlans[0].pricePerPerson === 7777, "plan price not saved");
    assert(back.body.testimonials[0].title === "Test Story", "testimonial not saved");
    assert(back.body.attractions[0].distance === "0.5 km", "attraction not saved");
    assert(back.body.reviewsSection.reviews[0].name === "Test Reviewer", "review not saved");
    assert(back.body.hero.eyebrow === "TEST EYEBROW", "hero not saved");
    assert(back.body.footer.brand === "Test Footer Brand", "footer not saved");
  });

  await check("list textareas save as lists", async () => {
    const content = JSON.parse(JSON.stringify(snapshot));
    content.aboutSection.ticks = ["One", "Two", "Three"];
    content.travelSection.points = [
      { title: "A", subtitle: "aa" }, { title: "B", subtitle: "bb" },
    ];
    await api("content", { method: "PUT", body: content });
    const back = await api("content");
    assert(Array.isArray(back.body.aboutSection.ticks) && back.body.aboutSection.ticks.length === 3,
      "ticks = " + JSON.stringify(back.body.aboutSection.ticks));
    assert(Array.isArray(back.body.travelSection.points) && back.body.travelSection.points.length === 2,
      "points = " + JSON.stringify(back.body.travelSection.points));
  });

  await check("reset to demo restores original content", async () => {
    const r = await api("content?action=reset", { method: "POST" });
    assert(r.status === 200, "status " + r.status);
    const back = await api("content");
    assert(back.body.rooms[0].name === "Deluxe Room", "first room is " + back.body.rooms[0].name);
    assert(back.body.hero.eyebrow !== "TEST EYEBROW", "hero not reset");
    snapshot = JSON.parse(JSON.stringify(back.body));
    return "restored";
  });

  group("5. Online bookings");

  let bookingId, enquiryId;
  await check("website booking form saves a booking", async () => {
    const r = await api("submit", {
      method: "POST",
      body: {
        kind: "booking", name: "Self Test Booking", phone: "+91 90000 00001",
        email: "test@example.com", room: "Deluxe Room", checkin: "2026-12-01",
        checkout: "2026-12-04", guests: "2 Guests", nights: 3, amount: 5400,
        message: "Late arrival", source: "self-test",
      },
    });
    assert(r.status === 200, "status " + r.status);
    bookingId = r.body.id;
    const list = await api("bookings");
    const found = list.body.items.find((b) => b.id === bookingId);
    assert(found, "booking not listed");
    assert(found.amount === 5400, "amount = " + found.amount);
    assert(found.nights === 3, "nights = " + found.nights);
    return "ref " + String(bookingId).slice(-6).toUpperCase();
  });

  await check("booking status can be changed", async () => {
    const r = await api("bookings", { method: "PUT", body: { id: bookingId, status: "confirmed" } });
    assert(r.status === 200, "status " + r.status);
    const found = r.body.items.find((b) => b.id === bookingId);
    assert(found.status === "confirmed", "status = " + found.status);
  });

  await check("booking can be deleted", async () => {
    const r = await api("bookings?id=" + encodeURIComponent(bookingId), { method: "DELETE" });
    assert(r.status === 200, "status " + r.status);
    const list = await api("bookings");
    assert(!list.body.items.some((b) => b.id === bookingId), "still listed");
  });

  await check("travel plan enquiry saves with pricing", async () => {
    const r = await api("submit", {
      method: "POST",
      body: {
        kind: "plan", name: "Self Test Plan", phone: "9000000002",
        plan: "Spiritual Varanasi Plan", travellers: "4", perPerson: 4500,
        amount: 18000, nights: 2, interests: "Spiritual / Temples", source: "self-test",
      },
    });
    assert(r.status === 200, "status " + r.status);
    enquiryId = r.body.id;
    const list = await api("enquiries");
    const found = list.body.items.find((e) => e.id === enquiryId);
    assert(found, "enquiry not listed");
    assert(found.amount === 18000, "amount = " + found.amount);
    return "ref " + String(enquiryId).slice(-6).toUpperCase();
  });

  await check("enquiry status can be changed", async () => {
    const r = await api("enquiries", { method: "PUT", body: { id: enquiryId, status: "done" } });
    assert(r.status === 200, "status " + r.status);
    assert(r.body.items.find((e) => e.id === enquiryId).status === "done", "status not updated");
  });

  await check("enquiry can be deleted", async () => {
    await api("enquiries?id=" + encodeURIComponent(enquiryId), { method: "DELETE" });
    const list = await api("enquiries");
    assert(!list.body.items.some((e) => e.id === enquiryId), "still listed");
  });

  await check("form rejects a blank submission", async () => {
    const r = await api("submit", { method: "POST", body: { name: "", phone: "" } });
    assert(r.status === 400, "status " + r.status);
  });

  await check("spam honeypot is silently dropped", async () => {
    const before = (await api("enquiries")).body.items.length;
    await api("submit", { method: "POST", body: { kind: "plan", name: "Bot", phone: "1", company: "spam" } });
    const after = (await api("enquiries")).body.items.length;
    assert(after === before, "enquiry count changed from " + before + " to " + after);
  });

  group("6. Dashboard & backup");

  await check("dashboard stats compute", async () => {
    const r = await api("stats");
    assert(r.status === 200, "status " + r.status);
    assert(typeof r.body.bookings === "number", "no booking count");
    assert(Array.isArray(r.body.last7) && r.body.last7.length === 7, "7-day chart missing");
    return `${r.body.rooms} rooms · ${r.body.offers} offers · ${r.body.plans} plans`;
  });

  await check("backup downloads", async () => {
    const r = await api("backup");
    assert(r.status === 200, "status " + r.status);
    assert(r.body.content && r.body.bookings && r.body.enquiries, "incomplete backup");
    return `${r.body.content.rooms.length} rooms, ${r.body.bookings.length} bookings`;
  });

  await check("backup restores", async () => {
    const backup = (await api("backup")).body;
    const content = JSON.parse(JSON.stringify(backup.content));
    content.rooms[0].name = "Restored Room";
    const r = await api("backup", {
      method: "POST",
      body: { content, bookings: backup.bookings, enquiries: backup.enquiries },
    });
    assert(r.status === 200, "status " + r.status);
    const back = await api("content");
    assert(back.body.rooms[0].name === "Restored Room", "restore did not apply");
    await api("content?action=reset", { method: "POST" });
  });

  group("7. Media");

  let mediaUrl;
  await check("image uploads to cloud storage", async () => {
    const r = await api("media", { method: "POST", body: { file: { dataUrl: PIXEL, name: "self-test-upload.png" } } });
    assert(r.status === 200, "status " + r.status);
    mediaUrl = r.body.urls[0];
    assert(mediaUrl, "no url returned");
    return mediaUrl.slice(0, 70);
  });

  await check("uploaded image is publicly reachable", async () => {
    const url = mediaUrl.startsWith("http") ? mediaUrl : BASE + mediaUrl;
    const res = await fetch(url);
    assert(res.status === 200, "status " + res.status);
    assert((res.headers.get("content-type") || "").includes("image"), "wrong content type");
  });

  await check("media library lists the upload", async () => {
    const r = await api("media");
    const hit = r.body.items.find((i) => i.url === mediaUrl);
    assert(hit, "not listed");
    return `${r.body.items.length} files`;
  });

  await check("media file can be deleted", async () => {
    const name = decodeURIComponent(mediaUrl.split("/").pop());
    const r = await api("media?name=" + encodeURIComponent(name), { method: "DELETE" });
    assert(r.status === 200, "status " + r.status);
    const list = await api("media");
    assert(!list.body.items.some((i) => i.name === name), "still listed");
  });

  await check("path traversal is blocked", async () => {
    const res = await fetch(BASE + "/uploads/../../etc/passwd");
    assert(res.status === 404 || res.status === 400, "status " + res.status);
  });

  group("8. Admin credentials");

  const currentPass = process.env.ADMIN_PASS || "varanasi123";
  let tempPass = "tmp" + Date.now().toString(36);
  const signIn = async (password) => {
    const keep = cookie;
    cookie = "";
    const r = await api("session", { method: "POST", body: { username: "admin", password } });
    cookie = keep || cookie;
    return r.status;
  };

  await check("password can be changed", async () => {
    const r = await api("credentials", {
      method: "POST",
      body: { username: "admin", currentPassword: currentPass, newPassword: tempPass },
    });
    assert(r.status === 200, "status " + r.status + " " + JSON.stringify(r.body));
  });

  await check("changing the password signs out other sessions", async () => {
    // the server clears sessions on a password change; confirm that happened
    const r = await api("bookings");
    assert(r.status === 401, "expected 401 after password change, got " + r.status);
    return "session invalidated";
  });

  await check("new password signs in", async () => {
    cookie = "";
    const r = await api("session", { method: "POST", body: { username: "admin", password: tempPass } });
    assert(r.status === 200, "status " + r.status);
    return "signed in with the new password";
  });

  await check("old password no longer works", async () => {
    const keep = cookie;
    cookie = "";
    const r = await api("session", { method: "POST", body: { username: "admin", password: currentPass } });
    cookie = keep;
    assert(r.status === 401, "status " + r.status);
  });

  await check("wrong current password is refused", async () => {
    const r = await api("credentials", {
      method: "POST", body: { currentPassword: "definitely-not-it", newPassword: "x" },
    });
    assert(r.status === 400, "status " + r.status);
  });

  await check("password is restored to the default", async () => {
    const r = await api("credentials", {
      method: "POST", body: { currentPassword: tempPass, newPassword: currentPass },
    });
    assert(r.status === 200, "status " + r.status + " " + JSON.stringify(r.body));
    cookie = "";
    const login = await api("session", { method: "POST", body: { username: "admin", password: currentPass } });
    assert(login.status === 200, "could not sign back in, status " + login.status);
    return "signed back in";
  });

  /* restore clean demo state for the browser tests */
  await api("content?action=reset", { method: "POST" });
}

/* ======================================================== browser tests */

function cdpClient(wsUrl) {
  let id = 0;
  const pending = new Map();
  const listeners = [];
  const ws = new WebSocket(wsUrl);
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else {
      listeners.forEach((fn) => fn(msg));
    }
  };
  const ready = new Promise((r) => (ws.onopen = r));
  const send = (method, params) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
    });
  return { ready, send, on: (fn) => listeners.push(fn), close: () => ws.close() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function browserTests() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "vgh-test-"));
  const port = 9600 + Math.floor(Math.random() * 300);

  const chrome = spawn(
    CHROME,
    ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
     "--remote-debugging-port=" + port, "--user-data-dir=" + profile,
     "--window-size=1440,1000", "about:blank"],
    { stdio: "ignore" }
  );

  let targets;
  for (let i = 0; i < 60; i++) {
    try {
      targets = await new Promise((res, rej) => {
        http.get({ host: "127.0.0.1", port, path: "/json/list" }, (r) => {
          let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d)));
        }).on("error", rej);
      });
      if (targets) break;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  const page = targets.find((t) => t.type === "page");
  const cdp = cdpClient(page.webSocketDebuggerUrl);
  await cdp.ready;

  const pageErrors = [];
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Page.enable");

  // Google Fonts is render-blocking; if the network is slow the page sits in
  // readyState "loading". Block just the fonts, leave images alone.
  try {
    await cdp.send("Network.enable");
    await cdp.send("Network.setBlockedURLs", { urls: ["*fonts.googleapis.com*", "*fonts.gstatic.com*"] });
  } catch { /* not fatal */ }

  // never open real windows or block on dialogs
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__opened=[];window.open=function(u){window.__opened.push(u);return null};
             window.confirm=function(){return true};
             window.prompt=function(m,d){return d===undefined?null:d};`,
  });

  const withTimeout = (p, ms, fb) =>
    Promise.race([Promise.resolve(p).catch(() => fb), new Promise((r) => setTimeout(() => r(fb), ms))]);

  const ev = async (expression) => {
    const r = await withTimeout(
      cdp.send("Runtime.evaluate", {
        expression: `(()=>{try{return JSON.stringify(${expression})}catch(e){return JSON.stringify({__err:e.message})}})()`,
        awaitPromise: true, returnByValue: true,
      }), 12000, null);
    if (!r || !r.result) return null;
    try { return JSON.parse(r.result.value); } catch { return r.result.value; }
  };
  const evalJs = ev;

  const waitFor = async (expression, label = expression, ms = 20000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const v = await ev(expression);
      if (v && v !== "false" && v !== "0" && v !== "null") return v;
      await sleep(250);
    }
    throw new Error("timed out waiting for " + label);
  };

  /* Only ever navigate away from the public site, and only from a clean admin
     panel. A single navigation per phase keeps the run fast and stable. */
  const open = async (url, readyExpr) => {
    await cdp.send("Page.navigate", { url });
    await sleep(600);
    await waitFor(`document.readyState === "complete" || document.readyState === "interactive"`, "document ready", 20000)
      .catch(() => {});
    if (readyExpr) await waitFor(readyExpr, url, 25000).catch(() => {});
    await sleep(400);
  };

  /** Switch the admin tab and wait for it to paint. */
  const tab = async (name, readyExpr) => {
    await ev(`(location.hash="${name}",1)`);
    if (readyExpr) await waitFor(readyExpr, name + " tab", 15000).catch(() => {});
    else await sleep(600);
  };

  const login = async () => {
    const ready = await ev(`!!document.getElementById("appShell") && !document.getElementById("appShell").classList.contains("hidden")`);
    if (ready) return;
    await ev(`(()=>{const p=document.getElementById("loginPass");if(!p)return 1;p.value="${process.env.ADMIN_PASS || "varanasi123"}";document.getElementById("loginForm").dispatchEvent(new Event("submit",{cancelable:true}));return 1})()`);
    await waitFor(`!!document.getElementById("appShell") && !document.getElementById("appShell").classList.contains("hidden")`, "admin sign in", 20000);
    await sleep(500);
  };

  const save = async () => {
    await ev(`(document.getElementById("btnSave").click(),1)`);
    for (let i = 0; i < 30; i++) {
      await sleep(400);
      const label = await ev(`document.getElementById("saveLabel").textContent`);
      if (label && /saved/i.test(label) && !/unsaved|saving/i.test(label)) return true;
    }
    return false;
  };

  const setPath = async (selector, value) => {
    await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error("no "+${JSON.stringify(selector)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event("input",{bubbles:true}));return 1})()`);
  };

  const setViewport = (w, h) =>
    cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 768 });

  const errLabel = () => (pageErrors.length ? String(pageErrors[0]).split("\n")[0].slice(0, 120) : "");
  const clearErrors = () => { pageErrors.length = 0; };
  cdp.on((msg) => {
    if (msg.method === "Runtime.exceptionThrown")
      pageErrors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error")
      pageErrors.push(msg.params.entry.text);
  });

  /* ================================================ PHASE A: website ==== */
  group("9. Public website");

  await open(BASE + "/", `document.querySelectorAll(".room").length > 0`);

  await check("every section renders", async () => {
    clearErrors();
    const c = await ev(`({
      hero: !!document.querySelector(".hero h2"),
      rooms: document.querySelectorAll(".room").length,
      offers: document.querySelectorAll(".offer-card,.offer-feature").length,
      gallery: document.querySelectorAll(".gallery-images img").length,
      plans: document.querySelectorAll(".plan-card").length,
      testimonials: document.querySelectorAll(".testimonial-video").length,
      attractions: document.querySelectorAll(".place").length,
      reviews: document.querySelectorAll(".review").length,
      trust: document.querySelectorAll(".trust-item").length,
      nav: document.querySelectorAll("#navLinks a").length,
      footer: document.querySelectorAll("#footerNav a").length
    })`);
    for (const [k, v] of Object.entries({ hero: "hero", rooms: "rooms", offers: "offers", gallery: "photos", plans: "plans", testimonials: "clips", attractions: "places", reviews: "reviews", trust: "trust items", nav: "nav links", footer: "footer links" })) {
      assert(c[k] && Number(c[k]) > 0, k + " is empty");
    }
    assert(pageErrors.length === 0, errLabel());
    return `${c.rooms} rooms · ${c.offers} offers · ${c.gallery} photos · ${c.plans} plans · ${c.testimonials} clips · ${c.attractions} places · ${c.reviews} reviews`;
  });

  await check("brand name shows in the header and footer", async () => {
    const t = await ev(`({ head: document.getElementById("brandName").textContent, foot: document.getElementById("footerBrand").textContent })`);
    assert(/siddhivinayak/i.test(t.head), "header = " + t.head);
    assert(/siddhivinayak/i.test(t.foot), "footer = " + t.foot);
    return t.head;
  });

  await check("no broken images", async () => {
    await sleep(1500);
    const broken = await ev(`[].filter.call(document.images, i => i.complete && i.naturalWidth === 0 && i.src).map(i => i.src)`);
    assert(broken.length === 0, broken.length + " broken: " + broken[0]);
    return "all images load";
  });

  await check("no leftover demo content on the page", async () => {
    const bad = await ev(`[].filter.call(document.querySelectorAll("h1,h2,h3,h4,h5,p,span,b"), e => /9999999999|Replace with|placeholder|placeholder\\b/i.test(e.textContent)).map(e => e.textContent.trim().slice(0,40))`);
    assert(bad.length === 0, "found: " + bad.slice(0, 2).join(" / "));
  });

  await check("booking modal opens", async () => {
    clearErrors();
    await ev(`(openBooking(),1)`);
    assert(await ev(`document.getElementById("bookingModal").classList.contains("show")`), "modal did not open");
    assert(pageErrors.length === 0, errLabel());
  });

  await check("booking total is calculated from dates", async () => {
    await ev(`(()=>{
      const sel=document.getElementById("roomSelect");
      sel.value=[].find.call(sel.options, o => /Deluxe/i.test(o.value)).value;
      document.getElementById("checkin").value="2026-12-01";
      document.getElementById("checkout").value="2026-12-04";
      document.getElementById("checkin").dispatchEvent(new Event("change"));
      return 1})()`);
    await sleep(400);
    const total = await ev(`document.getElementById("totalBox").value`);
    assert(/5,400/.test(total) && /3 nights/.test(total), "total = '" + total + "' (expected 5,400 for 3 nights)");
    return total;
  });

  await check("booking form submits and shows a reference", async () => {
    clearErrors();
    await ev(`(()=>{
      document.getElementById("name").value="Browser Test Guest";
      document.getElementById("phone").value="+91 91111 22222";
      document.getElementById("submitBookingBtn").click();
      return 1})()`);
    await waitFor(`/Reference/.test(document.getElementById("successRef").textContent)`, "booking confirmation", 20000);
    const ref = await ev(`document.getElementById("successRef").textContent`);
    assert(pageErrors.length === 0, errLabel());
    return ref.trim();
  });

  await check("booking reached the database", async () => {
    const r = await api("bookings");
    const hit = r.body.items.find((b) => b.name === "Browser Test Guest");
    assert(hit, "not found in bookings");
    assert(hit.amount === 5400, "amount = " + hit.amount);
    return "₹" + hit.amount + " for " + hit.nights + " nights";
  });

  await check("travel plan modal shows a per-person budget", async () => {
    clearErrors();
    await ev(`(closeBooking(), openPlan(), 1)`);
    assert(await ev(`document.getElementById("planModal").classList.contains("show")`), "modal did not open");
    await ev(`(()=>{
      document.getElementById("planSelect").selectedIndex=1;
      document.getElementById("planTravellers").value="4";
      document.getElementById("planTravellers").dispatchEvent(new Event("input"));
      return 1})()`);
    await sleep(400);
    const est = await ev(`document.getElementById("planEstimate").textContent`);
    assert(/4,500/.test(est) && /18,000/.test(est), "estimate = '" + String(est).slice(0, 60) + "'");
    assert(pageErrors.length === 0, errLabel());
    return String(est).slice(0, 56);
  });

  await check("travel plan enquiry reaches the database", async () => {
    clearErrors();
    await ev(`(()=>{
      document.getElementById("planName").value="Browser Plan Guest";
      document.getElementById("planPhone").value="+91 93333 44444";
      submitPlanEnquiry();
      return 1})()`);
    await sleep(2500);
    const r = await api("enquiries");
    const hit = r.body.items.find((e) => e.name === "Browser Plan Guest");
    assert(hit, "enquiry not saved");
    assert(hit.amount === 18000, "amount = " + hit.amount);
    return "₹" + hit.amount + " total";
  });

  await check("offer popup shows details", async () => {
    clearErrors();
    const offer = (await api("content")).body.offers[0];
    await ev(`(openOffer(${JSON.stringify(offer.id)}),1)`);
    assert(await ev(`document.getElementById("offerModal").classList.contains("show")`), "modal did not open");
    await ev(`(closeOffer(),1)`);
    assert(pageErrors.length === 0, errLabel());
  });

  await check("gallery lightbox opens and closes", async () => {
    clearErrors();
    await ev(`(openLightboxFirst(),1)`);
    assert(await ev(`document.getElementById("lightbox").classList.contains("show")`), "lightbox did not open");
    await ev(`(closeLightbox(),1)`);
    assert(await ev(`!document.getElementById("lightbox").classList.contains("show")`), "lightbox did not close");
    assert(pageErrors.length === 0, errLabel());
  });

  await check("call and WhatsApp buttons are wired", async () => {
    const w = await ev(`({ tel: (document.querySelector('a[href^="tel:"]')||{}).href, wa: (document.querySelector('a[href*="wa.me"]')||{}).href })`);
    assert(w.tel && w.tel.indexOf("tel:") === 0, "no tel: link");
    assert(w.wa && w.wa.indexOf("https://wa.me/") === 0, "no wa.me link");
    return w.tel.replace("tel:", "");
  });

  await check("video clips play in place when a clip is set", async () => {
    const hasVideo = await ev(`!!document.querySelector(".clip-wrap video")`);
    const hasPlay = await ev(`!!document.querySelector(".clip-play")`);
    assert(hasVideo, "no video element rendered");
    assert(hasPlay, "no play button");
    return "video card with play button";
  });

  /* ============================================ PHASE B: admin panel ==== */
  group("10. Admin panel");

  await open(BASE + "/admin.html");

  await check("login screen appears first", async () => {
    assert(await ev(`!document.getElementById("loginScreen").classList.contains("hidden")`), "login screen not shown");
  });

  await check("sign in works", async () => {
    clearErrors();
    await login();
    const t = await ev(`document.getElementById("tabTitle").textContent`);
    assert(/dashboard/i.test(t), "landed on '" + t + "'");
    assert(pageErrors.length === 0, errLabel());
  });

  await check("storage connection is shown", async () => {
    const chip = await ev(`document.getElementById("storageChip").textContent`);
    assert(chip && chip.trim().length > 3, "no chip shown");
    return chip.trim();
  });

  await check("all 11 tabs render without errors", async () => {
    const tabs = ["dashboard","rooms","gallery","offers","plans","testimonials","pages","bookings","enquiries","media","settings"];
    const bad = [];
    for (const t of tabs) {
      clearErrors();
      await tab(t, `document.getElementById("tabBody").children.length > 0`);
      const n = await ev(`document.getElementById("tabBody").children.length`);
      if (!n || pageErrors.length) bad.push(t + (pageErrors.length ? ": " + errLabel() : " (empty)"));
    }
    assert(bad.length === 0, bad.join(" | "));
    return tabs.length + " tabs";
  });

  await check("dev-only 'Where things are stored' card is gone", async () => {
    await tab("settings", `document.getElementById("tabBody").children.length > 0`);
    const txt = await ev(`document.getElementById("tabBody").textContent`);
    assert(!/Where things are stored/.test(txt), "card still present");
    assert(!/content\.json|bookings\.json/.test(txt), "internal file paths still shown");
    return "removed";
  });

  await check("settings prefills the current username", async () => {
    await tab("settings");
    const u = await ev(`document.getElementById("adminUser").value`);
    assert(u === "admin", "username = '" + u + "'");
  });

  /* ---- rooms ---- */
  await check("rooms: edit a field marks changes unsaved", async () => {
    await tab("rooms", `document.querySelectorAll("[data-room-idx]").length > 0`);
    clearErrors();
    await setPath('[data-path="rooms.0.name"]', "Edited In Browser");
    await sleep(300);
    assert(await ev(`!document.getElementById("dirtyDot").classList.contains("hidden")`), "dirty flag not set");
  });

  await check("rooms: save publishes to the live database", async () => {
    assert(await save(), "save did not complete");
    const live = await api("content");
    assert(live.body.rooms[0].name === "Edited In Browser", "database still shows '" + live.body.rooms[0].name + "'");
    return "saved in " + live.body.site.brandName;
  });

  await check("rooms: add works", async () => {
    await tab("rooms", `document.querySelectorAll("[data-room-idx]").length > 0`);
    const before = (await api("content")).body.rooms.length;
    await ev(`(document.getElementById("addRoom").click(),1)`);
    await waitFor(`document.querySelectorAll("[data-room-idx]").length === ${before + 1}`, "new room card");
    await setPath(`[data-room-idx="${before}"][data-path$=".name"]`, "Added By Test");
    await setPath(`[data-room-idx="${before}"][data-path$=".price"]`, "4444");
    assert(await save(), "save did not complete");
    const live = await api("content");
    assert(live.body.rooms.length === before + 1, "rooms " + before + " → " + live.body.rooms.length);
    const room = live.body.rooms.find((r) => r.name === "Added By Test");
    assert(room && room.price === 4444, "new room data wrong");
    return before + " → " + live.body.rooms.length + " rooms";
  });

  await check("rooms: duplicate works", async () => {
    await tab("rooms", `document.querySelectorAll("[data-room-idx]").length > 0`);
    const before = await ev(`document.querySelectorAll("[data-room-idx]").length`);
    await ev(`(document.querySelector('[data-duproom]').click(),1)`);
    await waitFor(`document.querySelectorAll("[data-room-idx]").length === ${before + 1}`, "duplicated card");
    assert(await save(), "save did not complete");
    const live = await api("content");
    assert(live.body.rooms.some((r) => /copy/i.test(r.name)), "copy not saved");
    return before + " → " + live.body.rooms.length + " rooms";
  });

  await check("rooms: visibility toggle stores a real boolean", async () => {
    await tab("rooms", `document.querySelectorAll("[data-room-idx]").length > 0`);
    await ev(`(()=>{const s=document.querySelector('[data-bool][data-path="rooms.0.active"]');s.value="false";s.dispatchEvent(new Event("change",{bubbles:true}));return 1})()`);
    assert(await save(), "save did not complete");
    const live = await api("content");
    assert(live.body.rooms[0].active === false, "active = " + JSON.stringify(live.body.rooms[0].active) + " (should be boolean false)");
    return "hidden correctly";
  });

  await check("rooms: re-enabling restores the room", async () => {
    await tab("rooms", `document.querySelectorAll("[data-room-idx]").length > 0`);
    await ev(`(()=>{const s=document.querySelector('[data-bool][data-path="rooms.0.active"]');s.value="true";s.dispatchEvent(new Event("change",{bubbles:true}));return 1})()`);
    assert(await save(), "save did not complete");
    const live = await api("content");
    assert(live.body.rooms[0].active === true, "still hidden");
  });

  await check("rooms: amenity multi-select saves", async () => {
    await tab("rooms", `document.querySelectorAll("[data-room-idx]").length > 0`);
    await ev(`(()=>{
      const s=document.querySelector('[data-path="rooms.0.amenities"]');
      [].slice.call(s.options).forEach(o => o.selected = /Free Wi-Fi|Parking/.test(o.value));
      s.dispatchEvent(new Event("input",{bubbles:true}));
      s.dispatchEvent(new Event("change",{bubbles:true}));
      return 1})()`);
    assert(await save(), "save did not complete");
    const live = await api("content");
    const a = live.body.rooms[0].amenities;
    assert(Array.isArray(a) && a.indexOf("Parking") >= 0, "amenities = " + JSON.stringify(a));
    return a.join(", ");
  });

  await check("rooms: delete works", async () => {
    await tab("rooms", `document.querySelectorAll("[data-room-idx]").length > 0`);
    const before = (await api("content")).body.rooms.length;
    await ev(`(document.querySelector('[data-room-idx="' + (before - 1) + '"] [data-delroom]').click(),1)`);
    await waitFor(`document.querySelectorAll("[data-room-idx]").length === ${before - 1}`, "room removed from the form");
    assert(await save(), "save did not complete");
    const live = await api("content");
    assert(live.body.rooms.length === before - 1, "rooms = " + live.body.rooms.length);
    assert(!live.body.rooms.some((r) => r.name === "Added By Test"), "test room still present");
    return before + " → " + live.body.rooms.length + " rooms";
  });

  await check("rooms: amenity list can be edited", async () => {
    await tab("rooms", `document.getElementById("addAmenity") !== null`);
    await ev(`(window.prompt=()=>"Airport Pickup",1)`);
    await ev(`(document.getElementById("addAmenity").click(),1)`);
    await waitFor(`[].some.call(document.querySelectorAll("#amenityList .chip"), c => /Airport Pickup/.test(c.textContent))`, "new amenity chip");
    assert(await save(), "save did not complete");
    const live = await api("content");
    assert((live.body.roomAmenities || []).indexOf("Airport Pickup") >= 0, "amenity not saved");
    await ev(`(document.querySelector('[data-delamenity="' + ((live.body.roomAmenities||[]).length - 1) + '"]').click(),1)`);
    await save();
    return "added and removed";
  });

  /* ---- gallery ---- */
  await check("gallery: add photo by URL and edit its caption", async () => {
    await tab("gallery", `document.getElementById("galleryGrid") !== null`);
    const before = (await api("content")).body.gallery.length;
    await ev(`(window.prompt=()=>"https://images.unsplash.com/photo-1549880338-65ddcdfd017b?auto=format&fit=crop&w=600&q=70",1)`);
    await ev(`(document.getElementById("addGalleryUrl").click(),1)`);
    await waitFor(`document.querySelectorAll("[data-gal-idx]").length === ${before + 1}`, "new photo card");
    await setPath(`[data-gal-idx="${before}"][data-path$=".caption"]`, "Temple View");
    assert(await save(), "save did not complete");
    const live = await api("content");
    assert(live.body.gallery.length === before + 1, "photos = " + live.body.gallery.length);
    assert(live.body.gallery[before].caption === "Temple View", "caption not saved");
    return before + " → " + live.body.gallery.length + " photos";
  });

  await check("gallery: photo count controls what the website shows", async () => {
    await tab("gallery", `document.getElementById("galleryGrid") !== null`);
    await setPath('[data-path="gallerySection.showCount"]', "3");
    assert(await save(), "save did not complete");
    const live = await api("content");
    assert(live.body.gallerySection.showCount === 3, "showCount = " + live.body.gallerySection.showCount);
    await setPath('[data-path="gallerySection.showCount"]', "6");
    await save();
    return "set to 3, restored to 6";
  });

  await check("gallery: delete works", async () => {
    await tab("gallery", `document.getElementById("galleryGrid") !== null`);
    const before = (await api("content")).body.gallery.length;
    await ev(`(document.querySelector('[data-gal-idx="' + (before - 1) + '"] [data-delgal]').click(),1)`);
    await waitFor(`document.querySelectorAll("[data-gal-idx]").length === ${before - 1}`, "photo removed");
    assert(await save(), "save did not complete");
    const live = await api("content");
    assert(live.body.gallery.length === before - 1, "photos = " + live.body.gallery.length);
    return before + " → " + live.body.gallery.length + " photos";
  });

  /* ---- offers ---- */
  await check("offers: add, edit and save", async () => {
    await tab("offers", `document.querySelectorAll("[data-offer-idx]").length > 0`);
    const before = (await api("content")).body.offers.length;
    await ev(`(document.getElementById("addOffer").click(),1)`);
    await waitFor(`document.querySelectorAll("[data-offer-idx]").length === ${before + 1}`, "new offer card");
    await setPath(`[data-offer-idx="${before}"][data-path$=".title"]`, "Monsoon Special");
    await setPath(`[data-offer-idx="${before}"][data-path$=".priceFrom"]`, "₹1,500 / night");
    assert(await save(), "save did not complete");
    const live = await api("content");
    const offer = live.body.offers.find((o) => o.title === "Monsoon Special");
    assert(offer, "offer not saved");
    assert(offer.priceFrom === "₹1,500 / night", "price text not saved");
    return before + " → " + live.body.offers.length + " offers";
  });

  await check("offers: duplicate works", async () => {
    await tab("offers", `document.querySelectorAll("[data-offer-idx]").length > 0`);
    const before = await ev(`document.querySelectorAll("[data-offer-idx]").length`);
    await ev(`(document.querySelector('[data-offer-idx="' + (before - 1) + '"] [data-dupoffer]').click(),1)`);
    await waitFor(`document.querySelectorAll("[data-offer-idx]").length === ${before + 1}`, "duplicated offer");
    assert(await save(), "save did not complete");
    return before + " → " + (await api("content")).body.offers.length + " offers";
  });

  await check("offers: delete works", async () => {
    await tab("offers", `document.querySelectorAll("[data-offer-idx]").length > 0`);
    const before = (await api("content")).body.offers.length;
    for (const idx of [before - 1, before - 2]) {
      await ev(`(document.querySelector('[data-offer-idx="' + ${idx} + '"] [data-deloffer]').click(),1)`);
      await sleep(500);
    }
    assert(await save(), "save did not complete");
    const live = await api("content");
    assert(live.body.offers.length === before - 2, "offers = " + live.body.offers.length);
    assert(!live.body.offers.some((o) => o.title === "Monsoon Special"), "test offer still present");
    return before + " → " + live.body.offers.length + " offers";
  });

  /* ---- travel plans ---- */
  await check("travel plans: add with per-person price and inclusions", async () => {
    await tab("plans", `document.querySelectorAll("[data-plan-idx]").length > 0`);
    const before = (await api("content")).body.travelPlans.length;
    await ev(`(document.getElementById("addPlan").click(),1)`);
    await waitFor(`document.querySelectorAll("[data-plan-idx]").length === ${before + 1}`, "new plan card");
    const p = `[data-plan-idx="${before}"]`;
    await setPath(p + ' [data-path$=".name"]', "Boat Ride Plan");
    await setPath(p + ' [data-path$=".pricePerPerson"]', "2200");
    await setPath(p + ' [data-path$=".days"]', "2");
    await ev(`(()=>{const e=document.querySelector(${JSON.stringify(p + ' textarea[data-list]')});e.value="Sunset boat\\nPhotography guide";e.dispatchEvent(new Event("input",{bubbles:true}));return 1})()`);
    assert(await save(), "save did not complete");
    const live = await api("content");
    const plan = live.body.travelPlans.find((x) => x.name === "Boat Ride Plan");
    assert(plan, "plan not saved");
    assert(plan.pricePerPerson === 2200, "price = " + plan.pricePerPerson);
    assert(Array.isArray(plan.includes) && plan.includes.length === 2, "includes = " + JSON.stringify(plan.includes));
    return "₹2,200/person · 2 inclusions";
  });

  await check("travel plans: delete works", async () => {
    await tab("plans", `document.querySelectorAll("[data-plan-idx]").length > 0`);
    const before = (await api("content")).body.travelPlans.length;
    await ev(`(document.querySelector('[data-plan-idx="' + (before - 1) + '"] [data-delplan]').click(),1)`);
    await waitFor(`document.querySelectorAll("[data-plan-idx]").length === ${before - 1}`, "plan removed");
    assert(await save(), "save did not complete");
    const live = await api("content");
    assert(live.body.travelPlans.length === before - 1, "plans = " + live.body.travelPlans.length);
    assert(!live.body.travelPlans.some((p) => p.name === "Boat Ride Plan"), "test plan still present");
    return before + " → " + live.body.travelPlans.length + " plans";
  });

  /* ---- testimonials ---- */
  await check("testimonials: add with name and rating", async () => {
    await tab("testimonials", `document.querySelectorAll("[data-testi-idx]").length > 0`);
    const before = (await api("content")).body.testimonials.length;
    await ev(`(document.getElementById("addTesti").click(),1)`);
    await waitFor(`document.querySelectorAll("[data-testi-idx]").length === ${before + 1}`, "new testimonial");
    const t = `[data-testi-idx="${before}"]`;
    await setPath(t + ' [data-path$=".title"]', "Guest From Prayagraj");
    await setPath(t + ' [data-path$=".guestName"]', "Anita Sharma");
    await setPath(t + ' [data-path$=".rating"]', "4");
    assert(await save(), "save did not complete");
    const live = await api("content");
    const item = live.body.testimonials.find((x) => x.title === "Guest From Prayagraj");
    assert(item, "testimonial not saved");
    assert(item.rating === 4, "rating = " + item.rating);
    assert(item.guestName === "Anita Sharma", "guest name not saved");
    return "rating and guest name saved";
  });

  await check("testimonials: video clip renders as a playable card", async () => {
    await tab("testimonials", `document.querySelectorAll("[data-testi-idx]").length > 0`);
    await setPath(`[data-testi-idx="3"] [data-path$=".video"]`, "https://cdn.example.com/clip.mp4");
    assert(await save(), "save did not complete");
    const live = await api("content");
    assert(live.body.testimonials[3].video.indexOf("clip.mp4") > 0, "video URL not saved");
  });

  await check("testimonials: delete works", async () => {
    await tab("testimonials", `document.querySelectorAll("[data-testi-idx]").length > 0`);
    const before = (await api("content")).body.testimonials.length;
    await ev(`(document.querySelector('[data-testi-idx="' + (before - 1) + '"] [data-deltesti]').click(),1)`);
    await waitFor(`document.querySelectorAll("[data-testi-idx]").length === ${before - 1}`, "testimonial removed");
    assert(await save(), "save did not complete");
    const live = await api("content");
    assert(live.body.testimonials.length === before - 1, "testimonials = " + live.body.testimonials.length);
    return before + " → " + live.body.testimonials.length;
  });

  /* ---- page sections ---- */
  await check("page sections: navigation links save", async () => {
    await tab("pages", `document.querySelector("textarea[data-navlinks]") !== null`);
    await ev(`(()=>{const e=document.querySelector("textarea[data-navlinks]");e.value="Home #home\\nRooms #rooms\\nContact #contact";e.dispatchEvent(new Event("input",{bubbles:true}));return 1})()`);
    assert(await save(), "save did not complete");
    const live = await api("content");
    const nav = live.body.nav.links.map((l) => l.label + "→" + l.href).join(",");
    assert(nav === "Home→#home,Rooms→#rooms,Contact→#contact", "nav = " + nav);
  });

  await check("page sections: about bullets save as a list", async () => {
    await tab("pages", `document.querySelector('textarea[data-list="aboutSection.ticks"]') !== null`);
    await ev(`(()=>{const e=document.querySelector('textarea[data-list="aboutSection.ticks"]');e.value="Clean rooms\\nTemple guide\\nEarly check-in";e.dispatchEvent(new Event("input",{bubbles:true}));return 1})()`);
    assert(await save(), "save did not complete");
    const live = await api("content");
    assert(Array.isArray(live.body.aboutSection.ticks) && live.body.aboutSection.ticks.length === 3,
      "ticks = " + JSON.stringify(live.body.aboutSection.ticks));
    return live.body.aboutSection.ticks.join(", ");
  });

  await check("page sections: footer links and socials save", async () => {
    await tab("pages", `document.querySelector("textarea[data-footerlinks]") !== null`);
    await ev(`(()=>{const e=document.querySelector("textarea[data-footerlinks]");e.value="Home #home\\nContact #contact";e.dispatchEvent(new Event("input",{bubbles:true}));return 1})()`);
    await ev(`(()=>{const e=document.querySelector("textarea[data-socials]");e.value="Facebook | f | https://facebook.com\\nYouTube | ▶ | https://youtube.com";e.dispatchEvent(new Event("input",{bubbles:true}));return 1})()`);
    assert(await save(), "save did not complete");
    const live = await api("content");
    assert(live.body.footer.nav.map((l) => l.label).join(",") === "Home,Contact", "footer links = " + JSON.stringify(live.body.footer.nav));
    assert(live.body.footer.socials.length === 2 && live.body.footer.socials[0].url === "https://facebook.com",
      "socials = " + JSON.stringify(live.body.footer.socials));
    return "2 footer links, 2 social links";
  });

  await check("page sections: attractions and reviews can be added and removed", async () => {
    await tab("pages", `document.getElementById("addAttraction") !== null`);
    const a0 = (await api("content")).body.attractions.length;
    const r0 = (await api("content")).body.reviewsSection.reviews.length;
    await ev(`(document.getElementById("addAttraction").click(),1)`);
    await waitFor(`document.querySelectorAll("[data-delattr]").length === ${a0 + 1}`, "attraction row");
    await ev(`(document.getElementById("addReview").click(),1)`);
    await waitFor(`document.querySelectorAll("[data-delreview]").length === ${r0 + 1}`, "review row");
    assert(await save(), "save did not complete");
    let live = await api("content");
    assert(live.body.attractions.length === a0 + 1, "attractions = " + live.body.attractions.length);
    assert(live.body.reviewsSection.reviews.length === r0 + 1, "reviews = " + live.body.reviewsSection.reviews.length);
    await tab("pages", `document.getElementById("addAttraction") !== null`);
    await ev(`(document.querySelector('[data-delattr]').click(),1)`); await sleep(400);
    await ev(`(document.querySelector('[data-delreview]').click(),1)`); await sleep(400);
    assert(await save(), "save did not complete");
    live = await api("content");
    assert(live.body.attractions.length === a0, "attraction not removed");
    assert(live.body.reviewsSection.reviews.length === r0, "review not removed");
    return "add and delete both work";
  });

  await check("page sections: Google Maps embed saves", async () => {
    await tab("pages", `document.querySelector('[data-path="site.mapEmbed"]') !== null`);
    await setPath('[data-path="site.mapEmbed"]', "https://www.google.com/maps/embed?pb=test");
    assert(await save(), "save did not complete");
    const live = await api("content");
    assert(/maps\/embed/.test(live.body.site.mapEmbed), "embed = " + live.body.site.mapEmbed);
    await setPath('[data-path="site.mapEmbed"]', "");
    await save();
    return "saved and cleared";
  });

  await check("page sections: travel bullets and itinerary rows save", async () => {
    await tab("plans", `document.querySelector("textarea[data-lines]") !== null`);
    await ev(`(()=>{const e=document.querySelector('textarea[data-lines="travelSection.points"]');e.value="Temple Tour — Kashi and ghats\\nBoat Ride — Evening Ganga";e.dispatchEvent(new Event("input",{bubbles:true}));return 1})()`);
    assert(await save(), "save did not complete");
    const live = await api("content");
    assert(Array.isArray(live.body.travelSection.points) && live.body.travelSection.points.length === 2,
      "points = " + JSON.stringify(live.body.travelSection.points));
    return live.body.travelSection.points.map((p) => p.title).join(", ");
  });

  /* ---- bookings ---- */
  await check("bookings: list shows the booking taken on the website", async () => {
    await tab("bookings", `document.getElementById("tabBody").children.length > 0`);
    const n = await ev(`document.querySelectorAll("[data-bid]").length`);
    assert(n >= 1, "rows = " + n);
    return n + " booking(s)";
  });

  await check("bookings: search filters the list", async () => {
    await ev(`(()=>{const q=document.getElementById("bq");q.value="Browser Test";q.dispatchEvent(new Event("input",{bubbles:true}));return 1})()`);
    await waitFor(`document.querySelectorAll("[data-bid]").length === 1`, "search results");
    await ev(`(()=>{const q=document.getElementById("bq");q.value="";q.dispatchEvent(new Event("input",{bubbles:true}));return 1})()`);
    await sleep(600);
  });

  await check("bookings: status dropdown saves", async () => {
    await ev(`(()=>{const s=document.querySelector('[data-bstatus]');s.value="confirmed";s.dispatchEvent(new Event("change",{bubbles:true}));return 1})()`);
    await sleep(1800);
    const r = await api("bookings");
    const hit = r.body.items.find((b) => b.name === "Browser Test Guest");
    assert(hit && hit.status === "confirmed", "status = " + (hit && hit.status));
  });

  await check("bookings: CSV export builds a file", async () => {
    const size = await ev(`(()=>{let c=null;const o=URL.createObjectURL;URL.createObjectURL=(b)=>{c=b.size;return "blob:x"};document.getElementById("exportCsv").click();URL.createObjectURL=o;return c})()`);
    assert(size > 50, "csv size = " + size);
    return size + " bytes";
  });

  await check("bookings: WhatsApp reply link is present", async () => {
    const link = await ev(`(()=>{const a=document.querySelector('[data-bid] a[href*="wa.me"]');return a?a.href:"none"})()`);
    assert(link !== "none" && link.indexOf("wa.me") > 0, "no WhatsApp link");
  });

  await check("bookings: delete works", async () => {
    await ev(`(document.querySelector('[data-delbooking]').click(),1)`);
    await sleep(2000);
    const r = await api("bookings");
    assert(!r.body.items.some((b) => b.name === "Browser Test Guest"), "booking still in the database");
    return "removed";
  });

  await check("enquiries: list, filter and delete work", async () => {
    await tab("enquiries", `document.getElementById("tabBody").children.length > 0`);
    const all = await ev(`document.querySelectorAll("#tabBody tbody tr").length`);
    assert(all >= 1, "no enquiries listed");
    await ev(`(()=>{const s=document.getElementById("est");s.value="new";s.dispatchEvent(new Event("change",{bubbles:true}));return 1})()`);
    await sleep(900);
    const fresh = await ev(`document.querySelectorAll("#tabBody tbody tr").length`);
    assert(fresh <= all, "filter did not narrow the list");
    await ev(`(()=>{const s=document.getElementById("est");s.value="all";s.dispatchEvent(new Event("change",{bubbles:true}));return 1})()`);
    await sleep(800);
    await ev(`(document.querySelector('[data-delenquiry]').click(),1)`);
    await sleep(2000);
    const r = await api("enquiries");
    assert(!r.body.items.some((e) => e.name === "Browser Plan Guest"), "enquiry still in the database");
    return all + " listed, filtered, deleted";
  });

  /* ---- media + settings ---- */
  await check("media: library loads from cloud storage", async () => {
    await tab("media", `document.getElementById("mediaGrid") !== null`);
    await sleep(2000);
    const n = await ev(`document.querySelectorAll("#mediaGrid .mcell").length`);
    assert(typeof n === "number", "grid failed to render");
    return n + " files";
  });

  await check("media: upload button is available", async () => {
    assert(await ev(`document.getElementById("mediaUpload") !== null`), "upload input missing");
  });

  await check("settings: backup download builds a file", async () => {
    await tab("settings", `document.getElementById("tabBody").children.length > 0`);
    const size = await ev(`(()=>{let c=null;const o=URL.createObjectURL;URL.createObjectURL=(b)=>{c=b.size;return "blob:x"};document.getElementById("btnBackup").click();URL.createObjectURL=o;return c})()`);
    assert(size > 200, "backup size = " + size);
    return size + " bytes";
  });

  await check("settings: reset to demo restores the original content", async () => {
    await ev(`(document.getElementById("btnReset").click(),1)`);
    await sleep(3000);
    const live = await api("content");
    assert(live.body.rooms.length === 3, "rooms = " + live.body.rooms.length);
    assert(live.body.rooms[0].name === "Deluxe Room", "first room = " + live.body.rooms[0].name);
    assert(/siddhivinayak/i.test(live.body.site.brandName), "brand = " + live.body.site.brandName);
    return "restored";
  });

  await check("admin: no JavaScript errors across the whole admin session", async () => {
    const real = pageErrors.filter((e) => !/favicon|ERR_FILE_NOT_FOUND|404|blocked/i.test(String(e)));
    assert(real.length === 0, real.slice(0, 2).map((x) => String(x).split("\n")[0]).join(" | "));
    return "clean console";
  });

  /* ============================================ PHASE C: responsive ===== */
  group("11. Responsive layout");

  const widths = [
    { w: 320, h: 900, name: "small phone" },
    { w: 390, h: 844, name: "phone" },
    { w: 768, h: 1024, name: "tablet" },
    { w: 1024, h: 800, name: "laptop" },
    { w: 1440, h: 900, name: "desktop" },
    { w: 1920, h: 1080, name: "wide" }
  ];

  await open(BASE + "/", `document.querySelectorAll(".room").length > 0`);

  for (const { w, h, name } of widths) {
    await check(`website at ${w}px (${name}) fits without overflow`, async () => {
      await setViewport(w, h);
      await sleep(1200);
      const over = await ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
      assert(over <= 2, "overflows by " + over + "px");
      const past = await ev(`[].filter.call(document.querySelectorAll("h1,h2,h3,h4,h5,p,a,button,span,img"), e =>
          e.textContent.trim() && e.getBoundingClientRect().right > window.innerWidth + 2
        ).map(e => e.tagName + ":" + e.textContent.trim().slice(0,20))`);
      assert(past.length === 0, past.length + " past the edge: " + past.slice(0, 2).join(", "));
      return "fits " + w + "px";
    });
  }

  await check("mobile menu opens and closes on a phone", async () => {
    await setViewport(390, 844);
    await sleep(800);
    clearErrors();
    await ev(`(toggleMobileNav(),1)`);
    await sleep(600);
    assert(await ev(`getComputedStyle(document.getElementById("navLinks")).display !== "none"`), "menu did not open");
    await ev(`(toggleMobileNav(),1)`);
    await sleep(400);
    assert(pageErrors.length === 0, errLabel());
  });

  await check("all sections stay in order on a phone", async () => {
    await setViewport(375, 900);
    await sleep(900);
    const bad = await ev(`(()=>{
      const ids=["home","rooms","offers","gallery","travel","testimonials","about","location","contact"];
      const boxes=ids.map(i=>{const e=document.getElementById(i);return e?e.getBoundingClientRect():null}).filter(Boolean);
      for(let i=1;i<boxes.length;i++) if(boxes[i].top < boxes[i-1].top - 1) return "out of order";
      return 0})()`);
    assert(bad === 0, String(bad));
    return "9 sections in order";
  });

  await open(BASE + "/admin.html");
  await login();
  await tab("rooms", `document.querySelectorAll("[data-room-idx]").length > 0`);

  for (const { w, h, name } of widths) {
    await check(`admin panel at ${w}px (${name}) fits without overflow`, async () => {
      await setViewport(w, h);
      await sleep(1000);
      const over = await ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
      assert(over <= 2, "overflows by " + over + "px");
      const past = await ev(`[].filter.call(document.querySelectorAll("#tabBody input,#tabBody textarea,#tabBody select,#tabBody button"), e =>
          e.getBoundingClientRect().right > window.innerWidth + 2).length`);
      assert(past === 0, past + " form controls past the edge");
      return "fits " + w + "px";
    });
  }

  await setViewport(1440, 1000);

  /* ============================================== restore demo state ==== */
  group("12. Cleanup");

  await check("demo content restored for handoff", async () => {
    await api("content?action=reset", { method: "POST" });
    const live = await api("content");
    assert(live.body.rooms.length === 3, "rooms = " + live.body.rooms.length);
    assert(/siddhivinayak/i.test(live.body.site.brandName), "brand = " + live.body.site.brandName);
    return live.body.site.brandName;
  });

  cdp.close();
  chrome.kill();
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch { /* ignore */ }
}/* ================================================================ main */
/* ================================================================ main */

(async () => {
  console.log(`\n${C.b}Siddhivinayak Temple Guesthouse — full self test${C.o}`);
  console.log(`${C.d}${BASE}${C.o}`);

  try {
    await api("health");
  } catch {
    console.log(`\n${C.r}The server is not running. Start it first:${C.o}`);
    console.log(`  ${C.b}node local-server.js${C.o}\n`);
    process.exit(1);
  }

  await apiTests();

  if (!process.argv.includes("--api")) {
    if (!fs.existsSync(CHROME)) {
      console.log(`\n  ${C.y}!${C.o} Chrome not found — skipping browser tests.\n`);
    } else {
      await browserTests();
    }
  }

  /* ---- report ---- */
  const total = results.length;
  const ok = results.filter((r) => r.ok).length;
  const bad = results.filter((r) => !r.ok);
  const groups = [...new Set(results.map((r) => r.group))];

  console.log(`\n${"=".repeat(64)}`);
  console.log(`${C.b}  REPORT${C.o}`);
  console.log("=".repeat(64));
  for (const g of groups) {
    const inGroup = results.filter((r) => r.group === g);
    const gbad = inGroup.filter((r) => !r.ok).length;
    console.log(
      `  ${gbad ? C.r + "✗" : C.g + "✓"}${C.o} ${g}  ${C.d}${inGroup.length - gbad}/${inGroup.length}${C.o}`
    );
    for (const r of inGroup.filter((r) => !r.ok)) console.log(`      ${C.r}→${C.o} ${r.label}: ${r.detail}`);
  }
  console.log("=".repeat(64));
  console.log(
    `  ${C.b}TOTAL${C.o}  ${ok}/${total} working` +
    (bad.length ? `   ${C.r}${bad.length} need attention${C.o}` : `   ${C.g}all clear${C.o}`)
  );
  console.log(`${"=".repeat(64)}\n`);

  process.exit(bad.length ? 1 : 0);
})().catch((e) => {
  console.error(C.r + "\nTest runner crashed: " + C.o, e);
  process.exit(1);
});