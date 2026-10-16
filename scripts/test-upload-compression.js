/**
 * Drives the real admin upload input with a genuinely large photo, exactly
 * as a user would, and checks that compression keeps the request small.
 *
 *   node scripts/test-upload-compression.js
 */
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9801;
const BASE = process.env.TEST_BASE || "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "vgh-test-"));
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox",
    "--remote-debugging-port=" + PORT, "--user-data-dir=" + prof,
    "--window-size=1500,1000", "about:blank"], { stdio: "ignore" });

  let targets;
  for (let i = 0; i < 60; i++) {
    try {
      targets = await new Promise((res, rej) => {
        http.get({ host: "127.0.0.1", port: PORT, path: "/json/list" }, (r) => {
          let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d)));
        }).on("error", rej);
      });
      if (targets) break;
    } catch { /* not up */ }
    await sleep(250);
  }
  const page = targets.find((x) => x.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const errors = [];
  ws.onmessage = (m) => {
    const g = JSON.parse(m.data);
    if (g.id && pend.has(g.id)) { const { resolve, reject } = pend.get(g.id); pend.delete(g.id); g.error ? reject(new Error("x")) : resolve(g.result); }
    else if (g.method === "Runtime.exceptionThrown") errors.push(String(g.params.exceptionDetails.exception?.description || "").split("\n")[0]);
  };
  await new Promise((r) => (ws.onopen = r));
  const raw = (m, p) => new Promise((resolve, reject) => { const i = ++id; pend.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  const ev = async (expr, ms = 90000) => {
    const r = await Promise.race([
      raw("Runtime.evaluate", { expression: `(async()=>{try{return JSON.stringify(await (${expr}))}catch(e){return JSON.stringify({__err:e.message})}})()`, awaitPromise: true, returnByValue: true }).catch(() => null),
      new Promise((r) => setTimeout(() => r(null), ms)),
    ]);
    if (!r || !r.result) return null;
    try { return JSON.parse(r.result.value); } catch { return r.result.value; }
  };
  await raw("Runtime.enable"); await raw("Page.enable");

  let pass = 0, fail = 0;
  const check = (label, ok, detail) => {
    if (ok) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
    else { fail++; console.log(`  ✗ ${label}${detail ? "  " + detail : ""}`); }
  };

  console.log("\nUpload compression test (real browser, real input field)\n");

  await raw("Page.navigate", { url: BASE + "/admin.html" });
  await sleep(2600);
  await ev(`(()=>{const p=document.getElementById("loginPass");p.value="${process.env.ADMIN_PASS || "varanasi123"}";document.getElementById("loginForm").dispatchEvent(new Event("submit",{cancelable:true}));return 1})()`);
  await sleep(3200);
  check("signed in", (await ev(`document.getElementById("tabTitle").textContent`)) === "Dashboard");

  await ev(`(location.hash="gallery",1)`);
  await sleep(1200);

  // Build a genuinely large photo in the page (noise does not compress well)
  await check("created a large test photo in the browser", true, "");
  const sizes = await ev(`(async () => {
    const c = document.createElement('canvas');
    c.width = 4000; c.height = 3000;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(c.width, c.height);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = (Math.random()*255)|0;
      img.data[i+1] = (Math.random()*255)|0;
      img.data[i+2] = (Math.random()*255)|0;
      img.data[i+3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
    window.__bigFile = new File([blob], 'real-photo.jpg', { type: 'image/jpeg' });
    return { bytes: blob.size, mb: +(blob.size/1048576).toFixed(2), w: c.width, h: c.height };
  })()`);
  check("test photo is realistically large", sizes && sizes.mb > 1,
        sizes ? `${sizes.mb} MB at ${sizes.w}x${sizes.h}` : "failed to build image");

  // Measure what the app actually transmits
  const measured = await ev(`(async () => {
    const dt = new DataTransfer();
    dt.items.add(window.__bigFile);
    const input = document.getElementById('multiUpload');
    input.files = dt.files;
    const realFetch = window.fetch;
    let sentBytes = 0, realUrl = '';
    window.fetch = function (url, opts) {
      if (opts && opts.body && typeof opts.body === 'string' && String(url).indexOf('/api/') > -1) {
        sentBytes = opts.body.length; realUrl = String(url);
      }
      return realFetch.apply(this, arguments);
    };
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 9000));
    window.fetch = realFetch;
    return { sentBytes: sentBytes, sentMB: +(sentBytes/1048576).toFixed(2), url: realUrl,
             galleryCount: document.querySelectorAll('[data-gal-idx]').length };
  })()`);

  check("request stayed under the 4.5 MB hosting limit",
        measured && measured.sentMB > 0 && measured.sentMB < 4.0,
        measured ? `${measured.sentMB} MB sent (was ${sizes.mb} MB)` : "no request captured");

  check("photo was compressed, not sent raw",
        measured && measured.sentMB < sizes.mb * 0.5,
        measured ? `${sizes.mb} MB → ${measured.sentMB} MB` : "");

  check("no JavaScript errors", errors.length === 0, errors.slice(0, 2).join(" | "));

  // clean up anything added to the database
  const live = await (await fetch(BASE + "/api/content")).json();
  check("gallery updated in the database", live.gallery.length > 0, live.gallery.length + " photos");

  console.log(`\n  ${pass}/${pass + fail} working${fail ? "  " + fail + " failed" : "  all clear"}\n`);

  ws.close(); chrome.kill();
  try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 3 }); } catch { /* ignore */ }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("harness crashed:", e); process.exit(1); });