-- =====================================================================
-- WA CTWA CAPI Inbox - Supabase schema
-- Jalankan seluruh file ini di Supabase Dashboard > SQL Editor.
-- Aman dijalankan ulang (idempotent).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Tabel: leads
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id                        uuid primary key default gen_random_uuid(),
  phone_number              text not null unique,            -- format 628xxx
  customer_name             text,
  source                    text not null default 'organic'
                              check (source in ('meta_ads', 'organic')),
  ctwa_clid                 text,
  ad_id                     text,
  ad_headline               text,
  status                    text not null default 'new'
                              check (status in ('new', 'qualified', 'closing', 'junk')),
  deal_value                numeric not null default 0 check (deal_value >= 0),
  capi_sent_events          jsonb not null default '[]'::jsonb,
  last_capi_response        jsonb,
  last_customer_message_at  timestamptz not null default now(),
  created_at                timestamptz not null default now()
);

create index if not exists leads_last_customer_message_at_idx
  on public.leads (last_customer_message_at desc);
create index if not exists leads_source_idx on public.leads (source);
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_ctwa_clid_idx
  on public.leads (ctwa_clid) where ctwa_clid is not null;

-- ---------------------------------------------------------------------
-- Tabel: messages
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references public.leads (id) on delete cascade,
  wa_message_id  text unique,                                 -- null untuk pesan mock
  direction      text not null check (direction in ('inbound', 'outbound')),
  content        text not null default '',
  created_at     timestamptz not null default now()
);

create index if not exists messages_lead_id_created_at_idx
  on public.messages (lead_id, created_at);

-- ---------------------------------------------------------------------
-- Row Level Security
-- Aplikasi hanya mengakses database dari server (API routes) memakai
-- SUPABASE_SERVICE_ROLE_KEY. RLS diaktifkan supaya anon key / akses
-- publik tidak bisa membaca data lead (nomor HP pelanggan).
-- Policy di bawah hanya memberi akses penuh ke role service_role.
-- ---------------------------------------------------------------------
alter table public.leads    enable row level security;
alter table public.messages enable row level security;

drop policy if exists "service_role full access leads" on public.leads;
create policy "service_role full access leads"
  on public.leads for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "service_role full access messages" on public.messages;
create policy "service_role full access messages"
  on public.messages for all
  to service_role
  using (true)
  with check (true);
