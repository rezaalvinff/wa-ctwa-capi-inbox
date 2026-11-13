-- =====================================================================
-- Migrasi v1 -> v2 (Mitsubishi DIPO): auto-tagging cold/warm, chatbot,
-- CAPI batch sync. Jalankan di Supabase Dashboard > SQL Editor.
--
-- - Tidak menghapus data lama.
-- - Status lama (new/qualified/closing/junk) dikonversi ke cold/warm
--   berdasarkan kelengkapan nama + domisili + unit.
-- - Aman dijalankan ulang (idempotent).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Kolom baru pada leads
-- ---------------------------------------------------------------------
alter table public.leads add column if not exists domicile         text;
alter table public.leads add column if not exists interested_unit  text;
alter table public.leads add column if not exists bot_active       boolean not null default true;
alter table public.leads add column if not exists capi_synced_at   timestamptz;
alter table public.leads add column if not exists wa_profile_name  text;
alter table public.leads add column if not exists is_simulated     boolean not null default false;
alter table public.leads add column if not exists warm_at          timestamptz;

-- Di v1 customer_name berisi nama profil WhatsApp. Simpan juga sebagai wa_profile_name.
update public.leads
   set wa_profile_name = customer_name
 where wa_profile_name is null
   and customer_name is not null;

-- Lead dummy v1 (nama berakhiran "(Dummy)") ditandai sebagai simulasi.
update public.leads
   set is_simulated = true
 where customer_name like '%(Dummy)'
   and is_simulated = false;

-- ---------------------------------------------------------------------
-- 2. Status: new/qualified/closing/junk -> cold/warm
-- ---------------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.leads'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.leads drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.leads alter column status set default 'cold';

update public.leads
   set status = case
                  when coalesce(btrim(customer_name), '') <> ''
                   and coalesce(btrim(domicile), '') <> ''
                   and coalesce(btrim(interested_unit), '') <> ''
                  then 'warm'
                  else 'cold'
                end;

update public.leads
   set warm_at = coalesce(warm_at, now())
 where status = 'warm';

alter table public.leads
  add constraint leads_status_check check (status in ('cold', 'warm'));

-- ---------------------------------------------------------------------
-- 3. Trigger auto-tagging cold / warm
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

create index if not exists leads_capi_sync_idx
  on public.leads (status, source, created_at desc) where ctwa_clid is not null;

-- ---------------------------------------------------------------------
-- 4. messages.sender_type (customer / bot / cs) + send_error
-- ---------------------------------------------------------------------
alter table public.messages add column if not exists sender_type text not null default 'customer';
alter table public.messages add column if not exists send_error  text;

-- Pesan keluar v1 seluruhnya balasan manual CS.
update public.messages
   set sender_type = 'cs'
 where direction = 'outbound'
   and sender_type = 'customer';

alter table public.messages drop constraint if exists messages_sender_type_check;
alter table public.messages
  add constraint messages_sender_type_check check (sender_type in ('customer', 'bot', 'cs'));

commit;
