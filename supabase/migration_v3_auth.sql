-- =====================================================================
-- Migrasi v3: Login & role (admin / agent)
-- Jalankan di Supabase Dashboard > SQL Editor setelah migration_v2_dipo.sql.
-- Aman dijalankan ulang (idempotent). Tidak menghapus data.
-- =====================================================================

begin;

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

alter table public.app_users enable row level security;

drop policy if exists "service_role full access app_users" on public.app_users;
create policy "service_role full access app_users"
  on public.app_users for all
  to service_role
  using (true)
  with check (true);

-- Siapa CS yang mengirim balasan manual.
alter table public.messages add column if not exists sent_by uuid references public.app_users (id) on delete set null;
alter table public.messages add column if not exists sent_by_name text;

commit;
