# Mitsubishi DIPO Lead & CAPI Hub

Inbox WhatsApp untuk tim CS/Sales dealer resmi Mitsubishi DIPO:

- **AI Chatbot kualifikasi**: membalas otomatis sebagai *Asisten Virtual Resmi Mitsubishi DIPO*, lalu menggali **nama**, **domisili**, dan **unit diminati** secara natural. Engine-nya Gemini 2.5 Flash dengan fallback rule-based.
- **Auto-tagging `cold` / `warm`**: lead otomatis menjadi `warm` begitu ketiga data terisi. Bot mengirim pesan konfirmasi lalu menyerahkan chat ke CS (`bot_active = false`).
- **Manual takeover**: CS bisa mengambil alih chat kapan saja, atau mengaktifkan bot kembali.
- **Atribusi Click-to-WhatsApp**: menangkap `ctwa_clid`, `ad_id`, dan `ad_headline` dari iklan Meta.
- **Meta CAPI batch sync**: mengirim event `Lead` untuk prospek warm CTWA 7 hari terakhir, lewat tombol manual atau cron harian.

Stack: Next.js 15 (App Router), TypeScript, Tailwind CSS v4, Supabase (PostgreSQL), `lucide-react`, Gemini API (`fetch`), dan modul `crypto` bawaan Node.

## Struktur

```
app/
  page.tsx                          # Header + navigasi 2 tab
  api/
    webhook/route.ts                # WhatsApp Cloud API: verifikasi + pesan masuk -> chatbot (after())
    messages/send/route.ts          # Balasan manual CS (sender_type 'cs')
    leads/route.ts                  # GET daftar lead + preview pesan terakhir
    leads/[id]/route.ts             # PATCH edit nama/domisili/unit + toggle bot_active
    leads/[id]/messages/route.ts    # GET detail lead + riwayat chat
    simulate/route.ts               # POST lead dummy CTWA/organik + balasan bot pertama
    simulate/reply/route.ts         # POST simulasi balasan pelanggan (multi-turn testing)
    capi/sync-warm/route.ts         # POST batch kirim event 'Lead' ke Meta CAPI
    capi/warm-leads/route.ts        # GET prospek warm CTWA 7 hari + statistik (Tab 2)
    cron/capi-sync/route.ts         # GET dipanggil Vercel Cron (proteksi CRON_SECRET)
    config/route.ts                 # GET flag non-rahasia untuk UI (mock mode, engine AI)
components/
  InboxTab.tsx                      # Tab 1: daftar prospek, roomchat, panel kualifikasi
  CapiSyncTab.tsx                   # Tab 2: statistik, tombol auto-send, tabel monitoring
  ui.tsx                            # Badge, tag WARM/COLD, copy button, formatter
lib/
  chatbot.ts                        # Gemini structured output + fallback rule-based + simulator
  bot-engine.ts                     # Orkestrasi bot: ekstraksi -> update lead -> handoff -> kirim WA
  capi.ts                           # Filter eligible + kirim CAPI per lead + logging
  leads.ts                          # computeStatus (cold/warm), missing fields
  mitsubishi.ts                     # Katalog unit, deteksi kota, normalisasi
  whatsapp.ts                       # Kirim teks via WhatsApp Cloud API
  supabase.ts, phone.ts, config.ts, http.ts, types.ts
supabase/
  schema.sql                        # Instalasi BARU (v2)
  migration_v2_dipo.sql             # Upgrade database v1 -> v2 tanpa menghapus data
vercel.json                         # Cron harian /api/cron/capi-sync
```

## Setup Database

| Kondisi | Jalankan di Supabase SQL Editor |
| --- | --- |
| Project baru | `supabase/schema.sql` |
| Sudah memakai v1 | `supabase/migration_v2_dipo.sql` |

Kedua file aman dijalankan ulang. Migrasi v2 melakukan hal berikut:

- Menambah kolom `domicile`, `interested_unit`, `bot_active`, `capi_synced_at`, plus `wa_profile_name`, `is_simulated`, `warm_at` di `leads`, serta `sender_type` dan `send_error` di `messages`.
- Mengonversi status lama (`new/qualified/closing/junk`) menjadi `cold`/`warm` berdasarkan kelengkapan data. Karena v1 belum punya domisili dan unit, semua lead lama menjadi `cold`.
- Menyalin `customer_name` lama ke `wa_profile_name`, karena di v1 kolom itu berisi nama profil WhatsApp.
- Menandai semua pesan keluar v1 sebagai `sender_type = 'cs'`.
- Memasang trigger `leads_auto_tag` yang menghitung ulang `status` dan `warm_at` di setiap insert/update. Status tetap konsisten walau data diedit langsung di database.

## Environment Variables

```bash
cp .env.example .env.local
```

| Variable | Wajib | Keterangan |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase (service role hanya dipakai di server) |
| `WEBHOOK_VERIFY_TOKEN` | ✅ | Verify token webhook Meta |
| `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN` | jika `MOCK_MODE=false` | Kirim balasan bot & CS ke WhatsApp |
| `META_DATASET_ID`, `META_ACCESS_TOKEN` | untuk CAPI | Dataset & token Conversions API |
| `META_TEST_EVENT_CODE` | opsional | Event muncul di tab *Test events*; kosongkan di production |
| `GEMINI_API_KEY` | opsional | Kosong = chatbot rule-based |
| `GEMINI_MODEL` | opsional | Default `gemini-2.5-flash` |
| `CRON_SECRET` | disarankan | Proteksi `/api/cron/capi-sync` (Vercel mengirim `Authorization: Bearer <CRON_SECRET>` otomatis) |
| `WA_BUSINESS_ACCOUNT_ID` | opsional | Dikirim sebagai `user_data.whatsapp_business_account_id` |
| `META_APP_SECRET` | disarankan | Verifikasi signature `X-Hub-Signature-256` webhook |
| `MOCK_MODE` | – | `true` = tidak ada pesan yang dikirim ke WhatsApp (bot & CS hanya disimpan ke DB) |

## Menjalankan

```bash
npm install
```

```bash
npm run dev
```

### Testing tanpa WhatsApp (`MOCK_MODE=true`)

1. Tab **Inbox & Chatbot** → klik **Simulasi Chat CTWA**. Lead dummy dibuat dan bot langsung menyapa serta menanyakan nama.
2. Klik **Simulasi Balasan Customer** berulang kali (jawaban otomatis sesuai data yang masih kurang), atau ketik sendiri di kolom *"ketik sebagai pelanggan"*.
3. Setelah nama, domisili, dan unit terkumpul, tag otomatis berubah menjadi **🔥 WARM**. Bot mengirim konfirmasi handoff dan beralih ke **Mode Manual CS**.
4. Buka tab **Meta CAPI Sync**. Lead tersebut muncul sebagai *Pending Sync*. Isi `META_TEST_EVENT_CODE` lalu klik **Auto-Send** dan cek tab *Test events* di Events Manager.

Lead simulasi (`is_simulated = true`) **tidak pernah** dikirimi pesan WhatsApp sungguhan, juga saat `MOCK_MODE=false`, karena nomor acaknya bisa milik orang lain. Simulasi balasan pelanggan hanya diizinkan untuk lead simulasi atau saat `MOCK_MODE=true`.

## Alur Chatbot

1. Pesan masuk (webhook / simulasi) disimpan sebagai `sender_type = 'customer'`.
2. Jika `bot_active = true`, `lib/bot-engine.ts` berjalan:
   - **Webhook**: respons `200 OK` dikirim lebih dulu, lalu bot berjalan via `after()` (Vercel `waitUntil`) dengan jeda 2,5 detik. Jika pelanggan mengirim beberapa pesan beruntun, hanya pesan terakhir yang dibalas, dan semua pesan tetap dibaca sebagai konteks. Webhook retry (duplikat `wa_message_id`) tidak memicu bot lagi.
   - Bot memanggil `generateBotReply()`. Dengan `GEMINI_API_KEY`, Gemini mengembalikan JSON `{ reply_message, extracted_name, extracted_domicile, extracted_unit }`. Jika key kosong atau Gemini error/timeout (15 detik), bot memakai rule-based.
   - Hanya data yang masih kosong yang diisi (nama dinormalisasi tanpa sapaan, unit ke nama baku).
   - Jika CS mengambil alih atau pesan baru masuk selama bot berpikir, balasan dibatalkan.
3. Jika ketiga data lengkap → `status = 'warm'`, `warm_at` diisi, bot mengirim pesan konfirmasi (Sales Consultant area domisili akan menghubungi), lalu `bot_active = false`.
4. Balasan disimpan sebagai `sender_type = 'bot'`. Jika `MOCK_MODE !== 'true'`, balasan dikirim ke WhatsApp. Error pengiriman disimpan di `messages.send_error` dan tampil merah di bubble chat.

Nama profil WhatsApp disimpan di `wa_profile_name` dan **tidak** otomatis menjadi `customer_name`. Nama prospek harus dikonfirmasi lewat chat; bot bertanya *"Apakah benar dengan X?"*.

Edit manual di panel kanan juga menghitung ulang status. Jika lead menjadi warm karena edit manual, bot dinonaktifkan (tanpa pesan otomatis).

## Meta CAPI Sync

`POST /api/capi/sync-warm` (tombol di Tab 2) dan `GET /api/cron/capi-sync` (cron) memakai logika yang sama (`lib/capi.ts`). Sebuah lead dikirim **hanya jika** memenuhi semua syarat berikut:

1. `status = 'warm'`
2. `source = 'meta_ads'`
3. `ctwa_clid` tidak null/kosong
4. `created_at` **atau** `last_customer_message_at` dalam 7 hari terakhir
5. `capi_sent_events` belum berisi `'Lead'`

Payload per lead (event dikirim satu per satu agar log per lead jelas, 5 paralel, maks. 500 per run):

```json
{
  "data": [{
    "event_name": "Lead",
    "event_time": 1763000000,
    "event_id": "<lead_id>_Lead",
    "action_source": "business_messaging",
    "messaging_channel": "whatsapp",
    "user_data": { "ph": ["<sha256 628xxx>"], "ctwa_clid": "ARAk..." },
    "custom_data": { "content_name": "Xpander Cross", "content_category": "Bekasi" }
  }],
  "test_event_code": "TEST12345"
}
```

- `event_time` memakai `warm_at` (kapan lead menjadi warm) bila masih dalam 7 hari; selain itu memakai waktu kirim.
- Jika sukses (HTTP 200): `'Lead'` ditambahkan ke `capi_sent_events` dan `capi_synced_at` diisi. Sukses maupun gagal, response Meta disimpan di `last_capi_response`.
- `event_id` yang konsisten juga membuat Meta men-deduplikasi bila sync manual dan cron berjalan bersamaan.

Cron di `vercel.json` berjalan `0 2 * * *` (UTC) = **09:00 WIB** setiap hari. Jika mengubah jadwal, ubah juga `CRON_SCHEDULE`/`CRON_LABEL` di `lib/config.ts` agar label di UI sama.

## Deploy ke Vercel

1. Import repo, isi environment variables, lalu deploy.
2. Webhook Meta: `https://<domain>/api/webhook` (subscribe field **messages**).
3. Isi `CRON_SECRET` agar endpoint cron tidak bisa dipanggil orang lain.

> ⚠️ Aplikasi ini belum memiliki login. Siapa pun yang mengetahui URL bisa melihat data prospek dan memicu sync CAPI. Sebelum dipakai tim, lindungi dengan Vercel Deployment Protection / Password Protection atau tambahkan autentikasi.

## Pindah ke VPS

```bash
npm ci && npm run build && npm run start
```

Di VPS, `vercel.json` tidak berlaku. Jadwalkan cron sendiri, misalnya:

```bash
0 9 * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/capi-sync
```
