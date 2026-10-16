/**
 * Build a static snapshot for hosts that cannot run the Node server
 * (e.g. GitHub Pages).
 *
 *   1. Start the server:   node local-server.js   (or the background service)
 *   2. Run:                node scripts/build-static.js
 *   3. Commit the regenerated assets/content.snapshot.json
 *
 * The website loads /api/content when a server is present and falls back
 * to this snapshot otherwise. In snapshot mode the site is a read-only
 * showcase: the booking and enquiry forms explain that they need the
 * live server.
 */
const fs = require("fs");
const path = require("path");

const BASE = process.env.SITE_BASE || "http://localhost:3000";
const OUT = path.join(__dirname, "..", "assets", "content.snapshot.json");

(async () => {
  const res = await fetch(BASE + "/api/content");
  if (!res.ok) throw new Error("server answered " + res.status + " — is it running?");
  const content = await res.json();

  // Snapshot is public, so strip anything that should stay server-side.
  delete content._internal;

  fs.writeFileSync(OUT, JSON.stringify(content));
  console.log(`  snapshot: ${Object.keys(content).length} sections, ` +
    `${(content.rooms || []).length} rooms, ${(content.gallery || []).length} photos`);
  console.log(`  wrote ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);
  console.log("  commit this file so the static demo stays in sync.");
})().catch((err) => {
  console.error("  build-static failed:", err.message);
  process.exit(1);
});