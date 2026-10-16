/**
 * Supabase setup helper.
 *
 *   node scripts/supabase-setup.js          check what is missing
 *   node scripts/supabase-setup.js --migrate   push local content into the database
 *   node scripts/supabase-setup.js --test      run a quick connectivity test
 *
 * TABLES: created by running supabase/schema.sql in the Supabase SQL editor.
 * The media bucket is created automatically by this script.
 */
const path = require("path");
const sb = require("../lib/supabase.js");
const store = require("../lib/store.js");

const KEY = "\x1b[33m";
const OK = "\x1b[32m";
const BAD = "\x1b[31m";
const DIM = "\x1b[2m";
const OFF = "\x1b[0m";

async function check() {
  console.log("");
  console.log("  Supabase project: " + (sb.ref || KEY + "(not set)" + OFF));

  if (!sb.configured) {
    console.log("  " + BAD + "Keys missing" + OFF + " — add them to the .env file.");
    console.log("");
    return 1;
  }

  const health = await sb.ping();
  if (!health.ok) {
    console.log("  " + BAD + "Cannot reach Supabase:" + OFF + " " + health.reason);
    console.log("");
    return 1;
  }
  console.log("  " + OK + "✓" + OFF + " project reachable, keys accepted");

  const tables = await sb.tablesReady();
  if (tables.ready) {
    console.log("  " + OK + "✓" + OFF + " all 12 tables present");
  } else {
    console.log("  " + BAD + "✗" + OFF + " tables not created yet: " + tables.missing.join(", "));
    console.log("");
    console.log("  " + KEY + "One-time step — create the tables:" + OFF);
    console.log("    1. Open  https://supabase.com/dashboard/project/" + sb.ref + "/sql");
    console.log("    2. Click " + KEY + "New query" + OFF);
    console.log("    3. Paste the contents of " + KEY + "supabase/schema.sql" + OFF);
    console.log("    4. Press " + KEY + "Run" + OFF);
    console.log("");
    console.log("  Until then the site keeps working from the local JSON copy.");
    console.log("");
  }

  const media = await sb.listFiles().catch(() => null);
  if (media) {
    console.log("  " + OK + "✓" + OFF + " storage bucket '" + sb.bucket + "' ready (" + media.length + " files)");
  }
  console.log("");
  return tables.ready ? 0 : 1;
}

async function migrate() {
  const tables = await sb.tablesReady();
  if (!tables.ready) {
    console.log(BAD + "  Run supabase/schema.sql first." + OFF);
    console.log("  Missing: " + tables.missing.join(", "));
    return 1;
  }
  const stats = await store.migrateLocal();
  console.log("");
  console.log("  " + OK + "✓" + OFF + " migrated local content into Supabase:");
  Object.entries(stats).forEach(([k, v]) => console.log("      " + k.padEnd(14) + v));
  console.log("");
  return 0;
}

(async () => {
  const args = process.argv.slice(2);
  let code = 1;
  if (args.includes("--migrate")) code = await migrate();
  else if (args.includes("--test")) {
    const ok = await check();
    console.log(ok === 0 ? "  " + OK + "Ready." + OFF + "\n" : "  " + BAD + "Action needed above." + OFF + "\n");
    code = ok;
  } else code = await check();
  process.exit(code);
})().catch((e) => {
  console.error(BAD + "  " + e.message + OFF);
  process.exit(1);
});