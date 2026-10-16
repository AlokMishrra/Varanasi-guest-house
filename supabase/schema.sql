-- =====================================================================
--  VARANASI GUEST HOUSE — database schema
--  Run this once in the Supabase dashboard:  SQL Editor → New query → Run
-- =====================================================================

-- ---------- singleton settings (hero, section text, contact, footer) ----
create table if not exists public.site_settings (
  id          text primary key default 'main',
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ---------- editable collections -----------------------------------------
-- Each row keeps the exact shape the admin panel submits, so nothing is
-- lost in translation. sort_order preserves the admin's drag-to-reorder.

create table if not exists public.rooms (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table if not exists public.gallery (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  sort_order  integer not null default 0,
  updated_at  timestamptz not null default now()
);

create table if not exists public.offers (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table if not exists public.travel_plans (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table if not exists public.testimonials (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table if not exists public.attractions (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  sort_order  integer not null default 0,
  updated_at  timestamptz not null default now()
);

create table if not exists public.reviews (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  sort_order  integer not null default 0,
  updated_at  timestamptz not null default now()
);

-- ---------- guest submissions -------------------------------------------

create table if not exists public.bookings (
  id          text primary key,
  kind        text not null default 'booking',
  name        text not null default '',
  phone       text not null default '',
  email       text not null default '',
  subject     text not null default '',
  room        text not null default '',
  checkin     text not null default '',
  checkout    text not null default '',
  guests      text not null default '',
  nights      integer,
  amount      numeric,
  plan        text not null default '',
  travellers  text not null default '',
  interests   text not null default '',
  message     text not null default '',
  source      text not null default 'website',
  status      text not null default 'new',
  created_at  timestamptz not null default now()
);

create table if not exists public.enquiries (
  id          text primary key,
  kind        text not null default 'general',
  name        text not null default '',
  phone       text not null default '',
  email       text not null default '',
  subject     text not null default '',
  room        text not null default '',
  checkin     text not null default '',
  checkout    text not null default '',
  guests      text not null default '',
  nights      integer,
  amount      numeric,
  plan        text not null default '',
  travellers  text not null default '',
  interests   text not null default '',
  message     text not null default '',
  source      text not null default 'website',
  status      text not null default 'new',
  created_at  timestamptz not null default now()
);

create table if not exists public.admin_users (
  username    text primary key,
  password    text not null,
  updated_at  timestamptz not null default now()
);

-- ---------- admin sessions (serverless-safe sign-ins) --------------------
-- Serverless hosts run many isolated copies of the code with no shared
-- memory, so sign-in tokens live here instead of in process memory.

create table if not exists public.admin_sessions (
  token       text primary key,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

-- ---------- media index (mirrors the files in the storage bucket) --------

create table if not exists public.media (
  name        text primary key,
  url         text not null,
  path        text not null,
  mime        text not null default 'application/octet-stream',
  size        bigint not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------- indexes -----------------------------------------------------

create index if not exists bookings_created_at_idx   on public.bookings  (created_at desc);
create index if not exists bookings_status_idx      on public.bookings  (status);
create index if not exists enquiries_created_at_idx  on public.enquiries (created_at desc);
create index if not exists enquiries_status_idx     on public.enquiries (status);
create index if not exists rooms_sort_order_idx     on public.rooms      (sort_order);
create index if not exists gallery_sort_order_idx    on public.gallery    (sort_order);
create index if not exists offers_sort_order_idx    on public.offers    (sort_order);
create index if not exists plans_sort_order_idx     on public.travel_plans (sort_order);
create index if not exists testi_sort_order_idx     on public.testimonials (sort_order);
create index if not exists admin_sessions_expires_idx on public.admin_sessions (expires_at);

-- =====================================================================
--  SECURITY
--  Every table is locked down. Nothing is readable or writable with the
--  anon key — all traffic goes through the Node server, which uses the
--  service-role key (that bypasses RLS).
-- =====================================================================

alter table public.site_settings  enable row level security;
alter table public.rooms          enable row level security;
alter table public.gallery        enable row level security;
alter table public.offers         enable row level security;
alter table public.travel_plans   enable row level security;
alter table public.testimonials   enable row level security;
alter table public.attractions    enable row level security;
alter table public.reviews        enable row level security;
alter table public.bookings       enable row level security;
alter table public.enquiries      enable row level security;
alter table public.admin_users    enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.media          enable row level security;

-- Intentionally NO policies are created: with RLS enabled and zero policies,
-- anon and authenticated roles get no access at all. The server holds the
-- service-role key and is the only writer.

-- The first admin account (change the password in Admin → Settings afterwards).
insert into public.admin_users (username, password)
values ('admin', 'varanasi123')
on conflict (username) do nothing;