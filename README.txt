VARANASI GUEST HOUSE — WEBSITE + ADMIN PANEL
============================================================

WHAT THIS IS
The guest house website with a full content-management admin panel and
online bookings, backed by Supabase (Postgres + Storage).

Rooms, prices, photos, offers, travel plans, testimonials and every line of
page text are edited from the admin panel and stored in the database.
Bookings and enquiries are saved to the database instead of only opening
WhatsApp.


HOW TO RUN
------------------------------------------------------------
Easiest way (Mac): double-click  START.command

It installs the website as a background service, then opens the admin
panel. After that the site keeps running even if you close every window,
and it starts automatically when the Mac starts. If it ever crashes it
restarts itself within seconds.

Check status anytime:   ./scripts/service.sh status
Stop it completely:     ./scripts/service.sh stop
Start it again:         ./scripts/service.sh start
Live log file:          logs/service.log

Developers can still run it by hand in a Terminal:
  node server.js               plain, stops when the window closes
  node scripts/run.js          supervised, auto-restarts after a crash

Then open:
  Website  http://localhost:3000/
  Admin    http://localhost:3000/admin.html

Default admin login:   admin  /  varanasi123
Change it in  Admin → Settings → Admin access.

There is nothing to install. No npm packages, no build step. Node 18 or
newer is the only requirement — Supabase is called over HTTPS from Node.

IMPORTANT: always open the site through http://localhost:3000/
Opening index.html or admin.html by double-clicking them will not work —
the page renders from the database, so it needs the server. If you do it by
accident the page explains what to do instead of showing a broken screen.


SUPABASE SETUP
------------------------------------------------------------
Project ref:  siamavpeootgyhiqqqkp

Credentials live in the .env file (already filled in). That file must never
be committed or sent to a browser — the Node server is the only thing that
talks to Supabase.

The "media" storage bucket is created automatically.

The database tables are created once, in the Supabase dashboard:

  1. Open  https://supabase.com/dashboard/project/siamavpeootgyhiqqqkp
  2. Left menu →  SQL Editor  →  New query
  3. Paste the contents of  supabase/schema.sql
  4. Press  Run

To check the connection at any time:

  node scripts/supabase-setup.js --test

To copy your existing local content into the database (after step 4):

  node scripts/supabase-setup.js --migrate


WHAT IS STORED WHERE
------------------------------------------------------------
Supabase tables
  site_settings     hero, trust strip, section text, contact, footer
  rooms             one row per room
  gallery           one row per photo
  offers            one row per seasonal offer
  travel_plans      one row per custom travel plan
  testimonials      one row per guest video
  attractions       nearby places
  reviews           guest reviews
  bookings          online booking requests
  enquiries         offer and travel-plan enquiries
  admin_users       admin username and password
  media             index of uploaded files

Supabase Storage
  media bucket      every uploaded photo and video clip

Local files (kept as an automatic mirror / offline fallback)
  data/content.json, data/bookings.json, data/enquiries.json
  uploads/           only used when Supabase is not configured


SECURITY NOTES
------------------------------------------------------------
* The secret (service-role) key is full-database access. It lives only in
  .env, which is in .gitignore. It is never sent to the browser.
* Row Level Security is enabled on every table with no policies, so the
  anon key cannot read or write anything. All traffic goes through the
  Node server.
* Because the secret key was pasted into a chat while setting this up,
  rotate it once in Supabase → Settings → API if this project is ever
  exposed. Paste the new value into .env as SUPABASE_SECRET_KEY.
* If Supabase is unreachable the server falls back to the local JSON copy
  and keeps accepting bookings, so the site never goes blank.


WHAT THE ADMIN PANEL MANAGES
------------------------------------------------------------
Dashboard
  Live counts, estimated booking value, recent activity, a launch
  checklist of the demo content still to be replaced.

Rooms & Rates
  Add / delete / duplicate rooms. Nightly rate, max guests, bed setup,
  size, badge, description, visibility (Live / Hidden), room photo,
  per-room amenity selection, extra photos. Drag cards to reorder.
  A global amenity list (Free Wi-Fi, Laundry, Parking …) is editable here
  and becomes the dropdown options for every room.

Gallery
  Section headline, subtitle, button text and how many photos to show.
  Upload photos in bulk, paste image URLs, set captions, click any photo
  to zoom, drag cards to reorder, delete.

Seasonal Offers
  Section text plus a featured card (large, with background photo) and any
  number of side offer cards. Each offer has a kicker, badge, description,
  price text, valid-till date, button text and terms line.

Custom Travel Plans
  Per-person budget, duration in days, minimum / maximum travellers,
  tagline, description, inclusions and exclusions (one per line).
  Each plan is published as a priced card under "Plan More Than Just Your
  Stay" and can be requested by guests — the request arrives in
  Enquiries with the per-person price and total estimate.

Testimonials
  Headline, caption, guest name, star rating, clip label, poster image and
  an optional video clip. Upload an MP4/WebM and the card plays it in
  place with a play button.

Page Sections
  Header & navigation, hero, trust strip, rooms section text, about us,
  nearby attractions, reviews, location & Google Maps embed, contact
  strip, booking form wording, footer links and social links.

Online Bookings
  Every booking request submitted on the website, with room, dates,
  nights, guests, estimated value and special request. Change status
  (new / pending / confirmed / cancelled / done), search, filter, delete,
  export to CSV, or jump straight into WhatsApp to reply.

Enquiries
  Offer clicks and custom travel plan requests, with the traveller count,
  interests, per-person price and total estimate. Same status handling.

Media Library
  All uploaded photos and videos. Copy a file's URL, or delete it.

Settings
  Guest house name, WhatsApp number, phone, email, address, currency,
  Google Maps embed link, directions search query, admin username and
  password, JSON backup download and restore, and a reset-to-demo button.


IMPORTANT BEHAVIOUR
------------------------------------------------------------
* Nothing goes live until you press "Save changes" (bottom-right).
  The site warns you before you leave with unsaved edits.
* Uploads are stored in the /uploads folder. Back this folder up.
* Editing in the admin changes the live site immediately after saving.


WHERE DATA IS STORED
------------------------------------------------------------
data/content.json    all website content
data/bookings.json   online booking requests
data/enquiries.json  offer and travel-plan enquiries
data/settings.json   admin username and password
uploads/             uploaded photos and video clips

Use Settings → Backup to download all of it as one JSON file.


GOING LIVE
------------------------------------------------------------
This needs a host that runs Node (Railway, Render, DigitalOcean, Fly.io,
or cPanel with "Setup Node.js App"). Copy this whole folder, set the port
the host provides, and run `node server.js`.

Before launch, work through the Launch checklist on the admin dashboard:
  1. Replace the demo WhatsApp number      (Settings → Contact)
  2. Paste the real Google Maps embed     (Settings → Location)
  3. Replace the demo room photos          (Rooms & Rates)
  4. Upload real guest video clips         (Testimonials)
  5. Confirm the real offer text and terms (Seasonal Offers)


FILE MAP
------------------------------------------------------------
START.command          one-click installer + launcher
scripts/service.sh     install / start / stop / status of the service
scripts/run.js         supervisor: restarts the server after a crash
scripts/self-test.js   full automated test (node scripts/self-test.js)
scripts/soak.js        stability test (node scripts/soak.js 5)
supabase/schema.sql    database tables (run once in the SQL editor)
scripts/               setup + migration helper
lib/supabase.js        Supabase client (fetch based, no dependencies)
lib/store.js           read/write layer with local fallback
index.html             public website shell
admin.html             admin panel shell
assets/site.css        website styles
assets/site.js         website rendering + booking / plan forms
assets/admin.css       admin styles
assets/admin.js        admin logic
server.js              backend: API, auth, uploads, static serving
seed-content.js        the original content, used for "Reset to demo"
.env                   Supabase keys (private, gitignored)