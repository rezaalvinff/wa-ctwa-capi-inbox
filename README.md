# WA CTWA CAPI Inbox

Mini-inbox WhatsApp (ala Qiscus) untuk tim CS:

- Menerima chat WhatsApp Cloud API via webhook dan membalas secara manual.
- Menangkap `ctwa_clid`, `ad_id`, dan `ad_headline` dari iklan **Click-to-WhatsApp (CTWA)** Meta Ads.
- Mengirim sinyal konversi offline (`Lead` / `Purchase`) ke **Meta Conversions API** secara real-time saat CS mengubah status lead.

Stack: Next.js 15 (App Router) + TypeScript + Tailwind CSS v4, Supabase (PostgreSQL), `lucide-react`. Hashing memakai modul `crypto` bawaan Node.js.

## Struktur Folder

```
app/
  page.tsx                         # UI inbox 3 kolom (daftar lead, chat, panel CRM & CAPI)
  api/
    webhook/route.ts               # GET verifikasi + POST pesan masuk WhatsApp Cloud API
    messages/send/route.ts         # Balasan manual CS (MOCK_MODE didukung)
    capi/route.ts                  # Update status/deal + kirim event ke Meta CAPI
    simulate/route.ts              # Buat lead + pesan dummy (CTWA / organik)
    leads/route.ts                 # GET daftar lead + preview pesan terakhir (untuk UI)
    leads/[id]/messages/route.ts   # GET detail lead + riwayat pesan (untuk UI)
lib/
  supabase.ts                      # Supabase client server-side (service role)
  phone.ts                         # Normalisasi nomor 62xxx + SHA-256
  types.ts, http.ts                # Tipe data & helper respons
supabase/schema.sql                # Tabel, index, constraint, RLS policy
.env.example                       # Daftar environment variables
```

## Setup

### 1. Supabase

1. Buat project di [supabase.com](https://supabase.com).
2. Buka **SQL Editor**, tempel isi `supabase/schema.sql`, lalu **Run**. File ini aman dijalankan ulang.
3. Ambil **Project URL** dan **service_role key** di **Project Settings → API**.

RLS diaktifkan dan hanya role `service_role` yang diberi akses. Semua akses database lewat API routes di server, jadi nomor HP pelanggan tidak bisa dibaca memakai anon key.

### 2. Environment variables

```bash
cp .env.example .env.local
```

| Variable | Wajib | Keterangan |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | URL project Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key (server only) |
| `WEBHOOK_VERIFY_TOKEN` | ✅ | String bebas, samakan dengan *Verify token* di Meta App |
| `WA_PHONE_NUMBER_ID` | jika `MOCK_MODE=false` | Phone Number ID dari WhatsApp → API Setup |
| `WA_ACCESS_TOKEN` | jika `MOCK_MODE=false` | Token System User (`whatsapp_business_messaging`) |
| `META_DATASET_ID` | ✅ untuk CAPI | Dataset ID di Events Manager |
| `META_ACCESS_TOKEN` | ✅ untuk CAPI | Access token Conversions API |
| `META_TEST_EVENT_CODE` | opsional | Kode *Test events*; kosongkan di production |
| `WA_BUSINESS_ACCOUNT_ID` | opsional | Bila diisi, dikirim sebagai `user_data.whatsapp_business_account_id` |
| `META_APP_SECRET` | opsional (disarankan) | Bila diisi, webhook memverifikasi `X-Hub-Signature-256` |
| `MOCK_MODE` | – | `true` = balasan CS hanya disimpan ke DB, tanpa memanggil WhatsApp API |

### 3. Jalankan lokal

```bash
npm install
```

```bash
npm run dev
```

Buka http://localhost:3000. Dengan `MOCK_MODE=true` Anda bisa langsung mencoba lewat tombol **Simulasi Chat CTWA** / **Simulasi Chat Organik**, lalu membalas chat dan mengubah status di panel kanan.

### 4. Deploy ke Vercel

1. Import repositori ini ke Vercel.
2. Isi semua environment variables di **Project Settings → Environment Variables**.
3. Deploy. URL webhook Anda: `https://<domain-vercel>/api/webhook`.

### 5. Hubungkan WhatsApp Cloud API

1. Meta App → **WhatsApp → Configuration → Webhook → Edit**.
2. Callback URL: `https://<domain-vercel>/api/webhook`, Verify token: nilai `WEBHOOK_VERIFY_TOKEN`.
3. Klik **Verify and save**, lalu subscribe field **messages**.
4. Set `MOCK_MODE=false` agar balasan CS benar-benar terkirim ke WhatsApp.

> Aturan 24 jam: WhatsApp hanya mengizinkan pesan teks bebas dalam 24 jam sejak pesan terakhir pelanggan. UI menampilkan banner kuning bila window sudah lewat. Di luar window, Meta akan menolak pesan dan error-nya ditampilkan di atas kolom input.

## Alur Atribusi & CAPI

1. Pelanggan klik iklan CTWA → pesan pertama berisi `referral.ctwa_clid` → lead disimpan dengan `source = 'meta_ads'`.
2. Chat tanpa referral membuat lead `organic`. Jika lead lama chat ulang tanpa referral, atribusi iklan yang sudah ada (`source`, `ctwa_clid`, `ad_id`, `ad_headline`) **tidak ditimpa**.
3. CS mengubah status di panel kanan lalu klik **Simpan & Kirim CAPI**:
   - `qualified` → event `Lead`, `closing` → event `Purchase` (dengan `value` = Deal Value, `currency` = IDR).
   - Event hanya dikirim jika `source = 'meta_ads'` dan `ctwa_clid` terisi. Status `new`/`junk` dan lead organik hanya memperbarui database.
   - Setiap event hanya dikirim sekali per lead (dicatat di `capi_sent_events`), dan `event_id = <lead_id>_<event_name>` juga membantu deduplikasi di sisi Meta.
   - Nomor telepon dinormalisasi ke `62xxx` lalu di-hash SHA-256. `ctwa_clid` dikirim tanpa hash.
   - Response Meta (sukses/error) beserta payload request (tanpa token) disimpan di `last_capi_response` dan tampil di panel kanan.

Contoh payload yang dikirim ke `POST https://graph.facebook.com/v21.0/<META_DATASET_ID>/events`:

```json
{
  "data": [
    {
      "event_name": "Purchase",
      "event_time": 1763000000,
      "event_id": "b6f1...-..._Purchase",
      "action_source": "business_messaging",
      "messaging_channel": "whatsapp",
      "user_data": {
        "ph": ["<sha256 dari 628xxxx>"],
        "ctwa_clid": "ARAk..."
      },
      "custom_data": { "currency": "IDR", "value": 1500000 }
    }
  ],
  "test_event_code": "TEST12345"
}
```

Untuk testing, isi `META_TEST_EVENT_CODE`, buat lead lewat **Simulasi Chat CTWA**, ubah status ke *Qualified*, lalu cek tab **Test events** di Events Manager. Karena `ctwa_clid` dummy bukan klik asli, Meta bisa menerima event tanpa atribusi atau mengembalikan error validasi. Respons tersebut tetap tercatat di log panel kanan.

## API

| Method | Endpoint | Body |
| --- | --- | --- |
| `GET` | `/api/webhook` | query `hub.mode`, `hub.verify_token`, `hub.challenge` |
| `POST` | `/api/webhook` | payload WhatsApp Cloud API |
| `POST` | `/api/messages/send` | `{ "lead_id": "...", "text": "..." }` |
| `POST` | `/api/capi` | `{ "lead_id": "...", "status": "qualified", "deal_value": 1500000 }` |
| `POST` | `/api/simulate` | `{ "type": "ctwa" }` atau `{ "type": "organic" }` (default `ctwa`) |
| `GET` | `/api/leads` | – |
| `GET` | `/api/leads/:id/messages` | – |

## Pindah ke VPS

Aplikasi ini Next.js standar tanpa fitur khusus Vercel:

```bash
npm ci && npm run build && npm run start
```

Database bisa tetap di Supabase. Atau migrasikan `supabase/schema.sql` ke PostgreSQL sendiri (dengan PostgREST/Supabase self-hosted, atau ganti `lib/supabase.ts` dengan driver Postgres lain).
