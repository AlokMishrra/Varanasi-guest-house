/**
 * Storage layer.
 *
 * Supabase is the primary store. If it is unreachable the same API is served
 * from local JSON files, so the site never goes blank.
 *
 * The shape returned to the rest of the app is exactly the old content.json
 * structure, so the frontend and admin panel need no changes.
 */
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { URL } = require("url");

const sb = require("./supabase.js");
const seed = require("../seed-content.js");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");

/** True when the filesystem accepts writes (false on Vercel's read-only disk). */
let diskWritable = false;
try {
  for (const d of [DATA_DIR, UPLOAD_DIR]) fs.mkdirSync(d, { recursive: true });
  const probe = path.join(DATA_DIR, ".write-test");
  fs.writeFileSync(probe, "ok");
  fs.unlinkSync(probe);
  diskWritable = true;
} catch {
  diskWritable = false;   // serverless bundle: Supabase is the only store
}

const CONTENT_FILE = path.join(DATA_DIR, "content.json");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");
const ENQUIRIES_FILE = path.join(DATA_DIR, "enquiries.json");

/** collection key -> table name */
const COLLECTIONS = {
  rooms: "rooms",
  gallery: "gallery",
  offers: "offers",
  travelPlans: "travel_plans",
  testimonials: "testimonials",
  attractions: "attractions",
  reviews: "reviews"
};

/** collections that live inside another object in the content document */
const NESTED = { reviews: "reviewsSection" };

/* ====================================================================== */
/*  local file store (fallback + first-run cache)                          */
/* ====================================================================== */

const readJson = async (file, fallback) => {
  try {
    return JSON.parse(await fsp.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
};
const writeJson = (file, value) => {
  if (!diskWritable) return Promise.resolve(); // read-only host: Supabase is the store
  const tmp = file + ".tmp";
  return fsp
    .writeFile(tmp, JSON.stringify(value, null, 2))
    .then(() => fsp.rename(tmp, file));
};

/** Mirror the live content to disk so there is always a local copy. */
const mirror = (content) => writeJson(CONTENT_FILE, content).catch(() => {});
const mirrorBookings = (rows) => writeJson(BOOKINGS_FILE, rows).catch(() => {});
const mirrorEnquiries = (rows) => writeJson(ENQUIRIES_FILE, rows).catch(() => {});

/* ====================================================================== */
/*  content                                                               */
/* ====================================================================== */

/** Rebuild the content document from Supabase rows. */
function assemble(settingsRow, collections) {
  const content = Object.assign({}, seed, settingsRow || {});
  for (const key of Object.keys(COLLECTIONS)) {
    const rows = collections[key];
    if (!rows) continue;
    // reviews live inside reviewsSection.reviews in the document shape
    if (NESTED[key]) {
      content[NESTED[key]] = Object.assign({}, content[NESTED[key]], { [key]: rows });
    } else {
      content[key] = rows;
    }
  }
  return content;
}

async function readCollections() {
  const out = {};
  await Promise.all(
    Object.keys(COLLECTIONS).map(async (key) => {
      const rows = await sb.select(COLLECTIONS[key], "select=data&order=sort_order.asc");
      out[key] = (rows || []).map((r) => r.data).filter(Boolean);
    })
  );
  return out;
}

async function getContent() {
  if (!sb.configured) return readJson(CONTENT_FILE, seed);
  try {
    const [settingsRows, collections] = await Promise.all([
      sb.select("site_settings", "select=data&id=eq.main&limit=1"),
      readCollections(),
    ]);
    if (!settingsRows || !settingsRows.length) {
      // never written yet — seed the database
      await writeContent(seed);
      return seed;
    }
    return assemble(settingsRows[0].data, collections);
  } catch (err) {
    console.warn("[store] Supabase read failed, using local copy:", err.message);
    return readJson(CONTENT_FILE, seed);
  }
}

/** Split the content document into the settings row and the collection rows. */
/** tables that carry an `active` flag in the schema */
const HAS_ACTIVE = new Set(["rooms", "offers", "travel_plans", "testimonials"]);

function splitContent(content) {
  const settings = {};
  const rooms = content.rooms || [];
  const gallery = content.gallery || [];
  const offers = content.offers || [];
  const travelPlans = content.travelPlans || [];
  const testimonials = content.testimonials || [];
  const attractions = content.attractions || [];
  const reviews = (content.reviewsSection && content.reviewsSection.reviews) || [];

  for (const key of Object.keys(content)) {
    if (Object.keys(COLLECTIONS).includes(key) || key === "reviewsSection") continue;
    settings[key] = content[key];
  }

  const rowsFor = (table, list) =>
    list.map((item, i) => {
      const row = {
        id: String(item.id || `i${i}`),
        data: item,
        sort_order: i,
        updated_at: new Date().toISOString(),
      };
      if (HAS_ACTIVE.has(table)) row.active = item.active !== false;
      return row;
    });

  return {
    settings,
    reviewsSection: Object.assign({}, content.reviewsSection, { reviews }),
    tables: {
      rooms: rowsFor("rooms", rooms),
      gallery: rowsFor("gallery", gallery),
      offers: rowsFor("offers", offers),
      travel_plans: rowsFor("travel_plans", travelPlans),
      testimonials: rowsFor("testimonials", testimonials),
      attractions: rowsFor("attractions", attractions),
      reviews: rowsFor("reviews", reviews),
    },
  };
}

async function writeContent(content) {
  mirror(content);
  if (!sb.configured) return writeJson(CONTENT_FILE, content);

  const { settings, reviewsSection, tables } = splitContent(content);
  const next = Object.assign({}, content, { reviewsSection });
  const stamp = new Date().toISOString();

  // settings singleton
  await sb.upsert(
    "site_settings",
    [{ id: "main", data: settings, updated_at: stamp }],
    "id"
  );

  // Collections: only write rows that actually changed, so a save that touches
  // one field does not rewrite every record in the database.
  const tableNames = Object.keys(tables);
  const existingByTable = await Promise.all(
    tableNames.map((table) => sb.select(table, "select=id,data,active,sort_order").catch(() => []))
  );

  await Promise.all(
    tableNames.map(async (table, i) => {
      const rows = tables[table];
      const byId = new Map((existingByTable[i] || []).map((r) => [String(r.id), r]));

      const changed = [];
      for (const row of rows) {
        const prev = byId.get(row.id);
        if (!prev) { changed.push(row); continue; }
        const dataSame = JSON.stringify(prev.data) === JSON.stringify(row.data);
        const activeSame = !HAS_ACTIVE.has(table) || (prev.active ?? true) === row.active;
        const orderSame = Number(prev.sort_order) === Number(row.sort_order);
        if (!dataSame || !activeSame || !orderSame) changed.push(row);
      }

      if (changed.length) await sb.upsert(table, changed, "id");

      const want = new Set(rows.map((r) => r.id));
      const gone = [...byId.keys()].filter((id) => !want.has(id));
      if (gone.length) {
        await sb.remove(table, "id=in.(" + gone.map((id) => `"${id}"`).join(",") + ")");
      }
    })
  );
  return next;
}

/** Overwrite the database with the original demo content. */
async function resetContent() {
  return writeContent(JSON.parse(JSON.stringify(seed)));
}

/** Push the local content.json into Supabase (first-time migration). */
async function migrateLocal() {
  const local = await readJson(CONTENT_FILE, seed);
  await writeContent(local);
  return {
    rooms: (local.rooms || []).length,
    gallery: (local.gallery || []).length,
    offers: (local.offers || []).length,
    plans: (local.travelPlans || []).length,
    testimonials: (local.testimonials || []).length,
  };
}

/* ====================================================================== */
/*  bookings & enquiries                                                   */
/* ====================================================================== */

const SUBMISSION_FIELDS = [
  "id", "kind", "name", "phone", "email", "subject", "room", "checkin", "checkout",
  "guests", "nights", "amount", "plan", "travellers", "interests", "message",
  "source", "status", "created_at"
];

function toRow(record) {
  const row = {};
  for (const f of SUBMISSION_FIELDS) {
    if (f === "created_at") {
      row.created_at = record.created_at || new Date().toISOString();
      continue;
    }
    row[f] = record[f] == null ? "" : record[f];
  }
  return row;
}

function fromRow(row) {
  const out = {};
  for (const f of SUBMISSION_FIELDS) out[f] = row[f];
  if (out.amount != null) out.amount = Number(out.amount);
  if (out.nights != null) out.nights = Number(out.nights);
  if (out.perPerson != null) out.perPerson = Number(out.perPerson);
  return out;
}

async function listSubmissions(table) {
  if (!sb.configured) {
    const file = table === "bookings" ? BOOKINGS_FILE : ENQUIRIES_FILE;
    return readJson(file, []);
  }
  try {
    const rows = await sb.select(table, "select=*&order=created_at.desc&limit=5000");
    return (rows || []).map(fromRow);
  } catch (err) {
    console.warn(`[store] ${table} read failed, using local copy:`, err.message);
    const file = table === "bookings" ? BOOKINGS_FILE : ENQUIRIES_FILE;
    return readJson(file, []);
  }
}

async function addSubmission(table, record) {
  const row = toRow(record);
  if (!sb.configured) {
    const items = await readJson(table === "bookings" ? BOOKINGS_FILE : ENQUIRIES_FILE, []);
    items.unshift(row);
    const file = table === "bookings" ? BOOKINGS_FILE : ENQUIRIES_FILE;
    await writeJson(file, items.slice(0, 5000));
    return row;
  }
  try {
    await sb.insert(table, [row]);
    return row;
  } catch (err) {
    // never lose a booking because the network blipped
    console.error(`[store] ${table} insert failed:`, err.message);
    const file = table === "bookings" ? BOOKINGS_FILE : ENQUIRIES_FILE;
    const items = await readJson(file, []);
    items.unshift(row);
    await writeJson(file, items.slice(0, 5000));
    return row;
  }
}

async function patchSubmission(table, id, patch) {
  if (!sb.configured) {
    const file = table === "bookings" ? BOOKINGS_FILE : ENQUIRIES_FILE;
    const items = await readJson(file, []);
    const next = items.map((r) => (r.id === id ? Object.assign({}, r, patch) : r));
    await writeJson(file, next);
    return next;
  }
  const clean = {};
  for (const [k, v] of Object.entries(patch)) if (SUBMISSION_FIELDS.includes(k) && k !== "id") clean[k] = v;
  await sb.update(table, `id=eq.${encodeURIComponent(id)}`, clean);
  return listSubmissions(table);
}

async function deleteSubmission(table, id) {
  if (!sb.configured) {
    const file = table === "bookings" ? BOOKINGS_FILE : ENQUIRIES_FILE;
    const items = await readJson(file, []);
    await writeJson(file, items.filter((r) => r.id !== id));
    return;
  }
  await sb.remove(table, `id=eq.${encodeURIComponent(id)}`);
}

/* ====================================================================== */
/*  admin credentials                                                      */
/* ====================================================================== */

const DEFAULT_AUTH = { username: "admin", password: "varanasi123" };

async function getAuth() {
  if (!sb.configured) return Object.assign({}, DEFAULT_AUTH);
  try {
    const rows = await sb.select("admin_users", "select=username,password&limit=1");
    if (!rows || !rows.length) return Object.assign({}, DEFAULT_AUTH);
    return { username: rows[0].username, password: rows[0].password };
  } catch (err) {
    console.warn("[store] credentials read failed:", err.message);
    return Object.assign({}, DEFAULT_AUTH);
  }
}

async function saveAuth(next) {
  if (!sb.configured) return;
  await sb.upsert(
    "admin_users",
    [{ username: next.username, password: next.password, updated_at: new Date().toISOString() }],
    "username"
  );
}

/* ====================================================================== */
/*  media                                                                  */
/* ====================================================================== */

const MIME_BY_EXT = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".m4v": "video/x-m4v", ".pdf": "application/pdf"
};
const mimeOf = (name) => MIME_BY_EXT[path.extname(name).toLowerCase()] || "application/octet-stream";

async function saveMedia(buffer, filename, mime) {
  const storedName = filename;
  if (sb.configured) {
    const storagePath = `${Date.now().toString(36)}-${storedName}`;
    await sb.upload(storagePath, buffer, mime);
    const url = sb.publicUrl(storagePath);
    await sb.upsert(
      "media",
      [{ name: storedName, url, path: storagePath, mime, size: buffer.length, created_at: new Date().toISOString() }],
      "name"
    ).catch(() => {});
    return { name: storedName, url, path: storagePath, mime, size: buffer.length };
  }
  if (!diskWritable) {
    throw new Error("Uploads need cloud storage — connect Supabase first.");
  }
  await fsp.writeFile(path.join(UPLOAD_DIR, storedName), buffer);
  return {
    name: storedName,
    url: "/uploads/" + storedName,
    path: storedName,
    mime,
    size: buffer.length,
  };
}

async function listMedia() {
  if (sb.configured) {
    try {
      const rows = await sb.select("media", "select=*&order=created_at.desc&limit=1000");
      return sb.resolveUrls(rows || []);
    } catch {
      /* fall through to disk */
    }
  }
  const files = await fsp.readdir(UPLOAD_DIR).catch(() => []);
  const items = [];
  for (const f of files) {
    const stat = await fsp.stat(path.join(UPLOAD_DIR, f)).catch(() => null);
    if (!stat) continue;
    items.push({
      name: f, url: "/uploads/" + f, path: f,
      mime: mimeOf(f), type: mimeOf(f), size: stat.size, created_at: stat.mtime.toISOString(),
    });
  }
  items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return items;
}

async function deleteMedia(name) {
  if (sb.configured) {
    try {
      const rows = await sb.select("media", `select=path&name=eq.${encodeURIComponent(name)}&limit=1`);
      if (rows && rows.length && rows[0].path) await sb.deleteFile(rows[0].path);
      await sb.remove("media", `name=eq.${encodeURIComponent(name)}`).catch(() => {});
      return;
    } catch {
      /* fall through to disk */
    }
  }
  await fsp.unlink(path.join(UPLOAD_DIR, path.basename(name))).catch(() => {});
}

/* ====================================================================== */

module.exports = {
  usingSupabase: sb.configured,
  supabaseRef: sb.ref,
  getContent,
  writeContent,
  resetContent,
  migrateLocal,
  listSubmissions,
  addSubmission,
  patchSubmission,
  deleteSubmission,
  getAuth,
  saveAuth,
  saveMedia,
  listMedia,
  deleteMedia,
};