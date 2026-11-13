-- =====================================================================
-- Migrasi v5: catatan sistem di roomchat (mis. "Lead dioper ke Agent X").
-- Jalankan di Supabase Dashboard > SQL Editor setelah migration_v4_routing_kb.sql.
-- Aman dijalankan ulang (idempotent). Tidak menghapus data.
-- =====================================================================

begin;

-- sender_type 'system' = catatan internal (tidak dikirim ke WhatsApp pelanggan).
alter table public.messages drop constraint if exists messages_sender_type_check;
alter table public.messages
  add constraint messages_sender_type_check check (sender_type in ('customer', 'bot', 'cs', 'system'));

-- Catatan sistem bukan "respon" sehingga tidak memperpanjang auto-close 24 jam.
create or replace function public.messages_touch_lead_activity()
returns trigger
language plpgsql
as $$
begin
  if new.sender_type = 'system' then
    return new;
  end if;
  update public.leads
     set last_activity_at = greatest(last_activity_at, new.created_at)
   where id = new.lead_id;
  return new;
end;
$$;

commit;
