/**
 * Drives the Media Library drop zone with a real file, exactly as a user
 * would, and confirms the upload lands in cloud storage.
 *
 *   node scripts/test-drag-drop.js
 */
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9811;
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

  console.log("\nDrag & drop upload test\n");

  await raw("Page.navigate", { url: BASE + "/admin.html" });
  await sleep(2600);
  await ev(`(()=>{const p=document.getElementById("loginPass");p.value="${process.env.ADMIN_PASS || "varanasi123"}";document.getElementById("loginForm").dispatchEvent(new Event("submit",{cancelable:true}));return 1})()`);
  await sleep(3200);
  check("signed in", (await ev(`document.getElementById("tabTitle").textContent`)) === "Dashboard");

  await ev(`(location.hash="media",1)`);
  await sleep(1500);
  check("drop zone is rendered", (await ev(`!!document.getElementById("mediaDrop")`)) === true);
  // wait until content has loaded, otherwise the drop can race the initial render
  await ev(`!!window.VGH_DATA && window.VGH_DATA.rooms`, "content loaded", 30000).catch(() => {});

  // Build a real photo in the page and drop it on the zone
  const result = await ev(`(async () => {
    const c = document.createElement('canvas');
    c.width = 3200; c.height = 2400;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(c.width, c.height);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = (Math.random()*255)|0; img.data[i+1] = (Math.random()*255)|0;
      img.data[i+2] = (Math.random()*255)|0; img.data[i+3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
    const file = new File([blob], 'dropped-photo.jpg', { type: 'image/jpeg' });

    const zone = document.getElementById('mediaDrop');
    const dt = new DataTransfer();
    dt.items.add(file);
    zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    const highlighted = zone.classList.contains('over');
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    await new Promise(r => setTimeout(r, 12000));
    return { originalMB: +(blob.size/1048576).toFixed(2), highlighted,
             progress: (document.getElementById('uploadProgress')||{}).textContent || '',
             cells: document.querySelectorAll('#mediaGrid .mcell').length };
  })()`);

  check("drop zone highlights while dragging", result && result.highlighted === true);
  check("drop triggered an upload", result && result.cells > 0, result ? result.cells + " file(s) in the library" : "no upload");
  check("no JavaScript errors", errors.length === 0, errors.slice(0, 2).join(" | "));

  // confirm it really reached cloud storage
  const stored = await ev(`(async () => {
    const r = await fetch('/api/media', { headers: { cookie: document.cookie } });
    const j = await r.json();
    return j.items.filter(i => /dropped-photo/.test(i.name)).map(i => ({ name: i.name, size: i.size }));
  })()`);
  check("file is in cloud storage", stored && stored.length > 0,
        stored && stored.length ? (stored[0].size / 1024).toFixed(0) + " KB" : "not found");

  console.log(`\n  ${pass}/${pass + fail} working${fail ? "  " + fail + " failed" : "  all clear"}\n`);

  ws.close(); chrome.kill();
  try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 3 }); } catch { /* ignore */ }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("harness crashed:", e); process.exit(1); });