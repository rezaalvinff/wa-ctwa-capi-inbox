-- =====================================================================
-- Migrasi v4: wilayah agent + auto-routing lead, auto-close chat 24 jam,
-- dan knowledge base chatbot.
-- Jalankan di Supabase Dashboard > SQL Editor setelah migration_v3_auth.sql.
-- Aman dijalankan ulang (idempotent). Tidak menghapus data.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Wilayah yang dipegang setiap agent (mis. {Jakarta, Depok, Bekasi})
-- ---------------------------------------------------------------------
alter table public.app_users add column if not exists regions text[] not null default '{}';

-- ---------------------------------------------------------------------
-- 2. Penugasan lead ke agent (null = ditangani Admin)
-- ---------------------------------------------------------------------
alter table public.leads add column if not exists assigned_agent_id uuid references public.app_users (id) on delete set null;
alter table public.leads add column if not exists assigned_at       timestamptz;
create index if not exists leads_assigned_agent_idx on public.leads (assigned_agent_id);

-- ---------------------------------------------------------------------
-- 3. Aktivitas terakhir room chat (pesan dari customer, bot, admin, agent).
--    Room dianggap CLOSED bila last_activity_at lebih dari 24 jam lalu,
--    dan otomatis terbuka lagi saat ada pesan baru.
-- ---------------------------------------------------------------------
alter table public.leads add column if not exists last_activity_at timestamptz not null default now();
create index if not exists leads_last_activity_idx on public.leads (last_activity_at desc);

update public.leads l
   set last_activity_at = greatest(
         l.last_customer_message_at,
         coalesce((select max(m.created_at) from public.messages m where m.lead_id = l.id), l.created_at)
       );

create or replace function public.messages_touch_lead_activity()
returns trigger
language plpgsql
as $$
begin
  update public.leads
     set last_activity_at = greatest(last_activity_at, new.created_at)
   where id = new.lead_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_lead_activity_trg on public.messages;
create trigger messages_touch_lead_activity_trg
  after insert on public.messages
  for each row execute function public.messages_touch_lead_activity();

-- ---------------------------------------------------------------------
-- 4. Knowledge base chatbot (materi dari file upload atau tulisan manual)
-- ---------------------------------------------------------------------
create table if not exists public.knowledge_items (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  source_type      text not null default 'manual' check (source_type in ('file', 'manual')),
  file_name        text,
  file_type        text,
  file_size        integer,
  content          text not null default '',
  is_active        boolean not null default true,
  created_by       uuid references public.app_users (id) on delete set null,
  created_by_name  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists knowledge_items_active_idx on public.knowledge_items (is_active, updated_at desc);

alter table public.knowledge_items enable row level security;

drop policy if exists "service_role full access knowledge_items" on public.knowledge_items;
create policy "service_role full access knowledge_items"
  on public.knowledge_items for all
  to service_role
  using (true)
  with check (true);

commit;
