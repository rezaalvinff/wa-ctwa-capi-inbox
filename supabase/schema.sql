-- =====================================================================
-- Mitsubishi DIPO Lead & CAPI Hub - Supabase schema (v2, instalasi baru)
--
-- Instalasi baru  : jalankan file ini di Supabase Dashboard > SQL Editor.
-- Upgrade dari v1 : JANGAN jalankan file ini, gunakan migration_v2_dipo.sql
--                   lalu migration_v3_auth.sql.
-- Upgrade dari v2 : jalankan migration_v3_auth.sql saja.
-- Aman dijalankan ulang (idempotent).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Tabel: leads
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id                        uuid primary key default gen_random_uuid(),
  phone_number              text not null unique,            -- format 628xxx
  customer_name             text,                            -- nama dari chatbot / CS (data kualifikasi #1)
  wa_profile_name           text,                            -- nama profil WhatsApp (belum terkonfirmasi)
  domicile                  text,                            -- kota/kabupaten (data kualifikasi #2)
  interested_unit           text,                            -- unit Mitsubishi (data kualifikasi #3)
  source                    text not null default 'organic'
                              check (source in ('meta_ads', 'organic')),
  ctwa_clid                 text,
  ad_id                     text,
  ad_headline               text,
  status                    text not null default 'cold'
                              constraint leads_status_check check (status in ('cold', 'warm')),
  warm_at                   timestamptz,                     -- kapan lead menjadi warm
  bot_active                boolean not null default true,   -- false = CS ambil alih manual
  is_simulated              boolean not null default false,  -- lead dummy dari tombol simulasi
  deal_value                numeric not null default 0 check (deal_value >= 0), -- legacy v1
  capi_sent_events          jsonb not null default '[]'::jsonb,
  capi_synced_at            timestamptz,
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
create index if not exists leads_capi_sync_idx
  on public.leads (status, source, created_at desc) where ctwa_clid is not null;

-- ---------------------------------------------------------------------
-- Auto-tagging cold / warm
-- warm  = customer_name, domicile, interested_unit ketiganya terisi
-- cold  = selain itu
-- Logika yang sama juga dijalankan di aplikasi (lib/leads.ts); trigger ini
-- menjamin status tetap konsisten walau data diedit langsung di database.
-- ---------------------------------------------------------------------
create or replace function public.leads_auto_tag()
returns trigger
language plpgsql
as $$
begin
  if coalesce(btrim(new.customer_name), '') <> ''
     and coalesce(btrim(new.domicile), '') <> ''
     and coalesce(btrim(new.interested_unit), '') <> '' then
    new.status := 'warm';
    if tg_op = 'INSERT' then
      new.warm_at := coalesce(new.warm_at, now());
    elsif old.status is distinct from 'warm' then
      new.warm_at := now();
    end if;
  else
    new.status := 'cold';
    new.warm_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_auto_tag_trg on public.leads;
create trigger leads_auto_tag_trg
  before insert or update on public.leads
  for each row execute function public.leads_auto_tag();

-- ---------------------------------------------------------------------
-- Tabel: app_users (login admin / agent)
-- ---------------------------------------------------------------------
create table if not exists public.app_users (
  id                  uuid primary key default gen_random_uuid(),
  email               text not null unique check (email = lower(email)),
  full_name           text not null,
  role                text not null default 'agent' check (role in ('admin', 'agent')),
  password_hash       text not null,                  -- scrypt (lib/auth/password.ts)
  is_active           boolean not null default true,
  session_version     integer not null default 1,     -- dinaikkan untuk memaksa logout
  failed_login_count  integer not null default 0,
  locked_until        timestamptz,
  last_login_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists app_users_role_idx on public.app_users (role);

-- ---------------------------------------------------------------------
-- Tabel: messages
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references public.leads (id) on delete cascade,
  wa_message_id  text unique,                                 -- null untuk pesan mock
  direction      text not null check (direction in ('inbound', 'outbound')),
  sender_type    text not null default 'customer'
                   constraint messages_sender_type_check check (sender_type in ('customer', 'bot', 'cs')),
  content        text not null default '',
  send_error     text,                                        -- error WhatsApp API bila gagal terkirim
  sent_by        uuid references public.app_users (id) on delete set null, -- CS pengirim (manual)
  sent_by_name   text,
  created_at     timestamptz not null default now()
);

create index if not exists messages_lead_id_created_at_idx
  on public.messages (lead_id, created_at);

-- ---------------------------------------------------------------------
-- Row Level Security
-- Aplikasi hanya mengakses database dari server (API routes) memakai
-- SUPABASE_SERVICE_ROLE_KEY. RLS diaktifkan supaya anon key / akses
-- publik tidak bisa membaca data lead (nomor HP pelanggan).
-- ---------------------------------------------------------------------
alter table public.leads     enable row level security;
alter table public.messages  enable row level security;
alter table public.app_users enable row level security;

drop policy if exists "service_role full access app_users" on public.app_users;
create policy "service_role full access app_users"
  on public.app_users for all
  to service_role
  using (true)
  with check (true);

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
